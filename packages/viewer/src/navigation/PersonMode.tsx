import type { Level } from '@decodeny/domain';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CapsuleCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  TrimeshCollider,
  useBeforePhysicsStep,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Euler, Quaternion } from 'three';
import type { LevelSlab } from '../scene/slabs';
import {
  chooseSpawn,
  closedDoorColliders,
  groundCollider,
  itemColliders,
  levelAtFeet,
  slabCollider,
  wallColliders,
  type BoxCollider,
} from './colliders';
import { useClosedDoors } from './door-context';
import { createHeadBob, stepHeadBob } from './head-bob';
import { capsuleDimensions } from './person-profile';
import { configurePersonController, stepPerson, type PersonMotionState } from './person-step';
import type { NavigationModeProps } from './types';
import { usePointerLook } from './use-pointer-look';
import { useMovementIntent } from './virtual-input';

/** Bajo esta altura (m) se considera que la persona cayó fuera del modelo y reaparece. */
const RESPAWN_BELOW = -10;
const CONTROLLER_OFFSET = 0.02;

type KinematicCharacterController = ReturnType<
  ReturnType<typeof useRapier>['world']['createCharacterController']
>;

/**
 * Recorrido en primera persona: una cápsula de la estatura del perfil (1,70 m por defecto)
 * con gravedad y colisiones contra muros, movida por un controlador cinemático de Rapier.
 * Este módulo se carga bajo demanda (Rapier es WASM) — ver `registry.ts`.
 */
export default function PersonMode(props: NavigationModeProps) {
  // Todas las plantas colisionan: se sube y se baja por las escaleras.
  const lowest = props.levels[0]?.id;
  return (
    <Physics gravity={[0, 0, 0]} timeStep={1 / 60}>
      {props.levels.map((level) => (
        <LevelColliders
          key={level.id}
          level={level}
          slab={props.slabs.get(level.id)}
          lowest={level.id === lowest}
        />
      ))}
      {props.levels.map((level) => (
        <DoorColliders key={level.id} level={level} />
      ))}
      <PersonController {...props} />
    </Physics>
  );
}

/** Orientación de una caja: inclinación y luego giro (orden `YXZ`, como las piezas). */
const boxQuaternion = (box: BoxCollider): [number, number, number, number] => {
  const q = new Quaternion().setFromEuler(new Euler(box.pitch ?? 0, box.rotationY, 0, 'YXZ'));
  return [q.x, q.y, q.z, q.w];
};

function Boxes({ boxes }: { readonly boxes: readonly BoxCollider[] }) {
  return boxes.map((box, i) => (
    <CuboidCollider
      key={i}
      args={box.halfExtents}
      position={box.position}
      quaternion={boxQuaternion(box)}
    />
  ));
}

const LevelColliders = memo(function LevelColliders({
  level,
  slab,
  lowest,
}: {
  readonly level: Level;
  readonly slab: LevelSlab | undefined;
  /** La más baja se apoya en un suelo continuo; las demás, en su losa. */
  readonly lowest: boolean;
}) {
  const boxes = useMemo(
    () => [
      ...wallColliders(level),
      ...itemColliders(level),
      ...(lowest ? [groundCollider(level)] : []),
    ],
    [level, lowest],
  );
  const floor = useMemo(
    () => (!lowest && slab?.below ? slabCollider(level, slab.below) : null),
    [level, lowest, slab],
  );
  return (
    <RigidBody type="fixed" colliders={false}>
      <Boxes boxes={boxes} />
      {floor && <TrimeshCollider args={[floor.vertices, floor.indices]} />}
    </RigidBody>
  );
});

/** Las puertas cerradas tapan su vano; abiertas o moviéndose, se atraviesan. */
function DoorColliders({ level }: { readonly level: Level }) {
  const closed = useClosedDoors(level);
  const boxes = useMemo(() => closedDoorColliders(level, closed), [closed, level]);
  if (boxes.length === 0) return null;
  return (
    <RigidBody key={closed.join(' ')} type="fixed" colliders={false}>
      <Boxes boxes={boxes} />
    </RigidBody>
  );
}

function PersonController({
  level,
  levels,
  onLevelChange,
  selection,
  profile,
  onPointerLockChange,
  walkStart,
  headBob = false,
  virtualInput,
}: NavigationModeProps) {
  const camera = useThree((s) => s.camera);
  const { world } = useRapier();
  const look = usePointerLook(onPointerLockChange, undefined, virtualInput);
  const readIntent = useMovementIntent(virtualInput);
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const motion = useRef<PersonMotionState>({ verticalSpeed: 0 });
  const dims = capsuleDimensions(profile);

  // Se calcula una sola vez al entrar al modo.
  const [spawn] = useState(() =>
    chooseSpawn(
      level,
      selection,
      camera,
      new Euler().setFromQuaternion(camera.quaternion, 'YXZ').y,
      walkStart ?? null,
    ),
  );
  const spawnCenter: [number, number, number] = [
    spawn.feet[0],
    spawn.feet[1] + dims.centerY,
    spawn.feet[2],
  ];

  useEffect(() => {
    // Mirada horizontal al aparecer, conservando el rumbo.
    look.current.yaw = spawn.yaw;
    look.current.pitch = 0;
    camera.rotation.set(0, spawn.yaw, 0, 'YXZ');
  }, [camera, look, spawn]);

  // Se crea en un efecto (no en useMemo) para que su ciclo de vida acompañe al montaje,
  // incluido el doble montaje de StrictMode: Rapier libera la memoria al removerlo.
  const controller = useRef<KinematicCharacterController | null>(null);
  useEffect(() => {
    const c = world.createCharacterController(CONTROLLER_OFFSET);
    configurePersonController(c, profile);
    controller.current = c;
    return () => {
      controller.current = null;
      world.removeCharacterController(c);
    };
  }, [world, profile]);

  useBeforePhysicsStep((stepWorld) => {
    const b = body.current;
    const c = collider.current;
    const kcc = controller.current;
    if (!b || !c || !kcc) return;
    const t = b.translation();
    if (t.y < RESPAWN_BELOW) {
      motion.current.verticalSpeed = 0;
      b.setNextKinematicTranslation({ x: spawnCenter[0], y: spawnCenter[1], z: spawnCenter[2] });
      return;
    }
    const intent = readIntent();
    const next = stepPerson(
      kcc,
      c,
      t,
      motion.current,
      intent,
      look.current.yaw,
      profile,
      stepWorld.timestep,
    );
    b.setNextKinematicTranslation(next);
  });

  // Planta informada; la activa puede cambiar también desde afuera (el selector).
  const reportedLevel = useRef(level.id);
  useEffect(() => {
    reportedLevel.current = level.id;
  }, [level.id]);

  // Balanceo de cabeza opcional, según la velocidad horizontal real (no la intención).
  const bob = useRef(createHeadBob());
  const last = useRef<{ x: number; z: number } | null>(null);
  useFrame((_, dt) => {
    const t = body.current?.translation();
    if (!t) return;
    let offset = 0;
    if (headBob && dt > 0) {
      const prev = last.current ?? t;
      offset = stepHeadBob(bob.current, Math.hypot(t.x - prev.x, t.z - prev.z) / dt, dt);
    }
    last.current = { x: t.x, z: t.z };
    camera.position.set(t.x, t.y + dims.eyeOffset + offset, t.z);
    // La planta en la que está la persona: la más alta cuyo piso alcanzan los pies.
    const here = levelAtFeet(levels, (t.y - dims.centerY) * 1000);
    if (here && here.id !== reportedLevel.current) {
      reportedLevel.current = here.id;
      onLevelChange?.(here.id);
    }
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={spawnCenter}>
      <CapsuleCollider ref={collider} args={[dims.halfHeight, dims.radius]} />
    </RigidBody>
  );
}
