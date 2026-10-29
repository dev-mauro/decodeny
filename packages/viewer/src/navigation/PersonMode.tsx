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
import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Euler, Quaternion } from 'three';
import type { LevelSlab } from '../scene/slabs';
import {
  chooseSpawn,
  closedDoorColliders,
  closedRoomColliders,
  elevatorDoorColliders,
  elevatorPlatformCollider,
  groundCollider,
  itemColliders,
  levelAtFeet,
  slabCollider,
  wallColliders,
  type BoxCollider,
} from './colliders';
import { useClosedDoors } from './door-context';
import { ElevatorStoreContext, useElevatorState } from './elevator-context';
import {
  closedStops,
  elevatorAction,
  elevatorUnder,
  isMoving,
  projectElevators,
  type Elevator,
  type ElevatorAction,
} from './elevators';
import { createHeadBob, stepHeadBob } from './head-bob';
import { capsuleDimensions } from './person-profile';
import { configurePersonController, stepPerson, type PersonMotionState } from './person-step';
import { guidedStep, newGuideState, stairGuides } from './stair-guide';
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
  const elevators = useMemo(() => projectElevators(props.levels), [props.levels]);
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
      {elevators.map((elevator) => (
        <ElevatorColliders key={elevator.id} elevator={elevator} />
      ))}
      <PersonController {...props} elevators={elevators} />
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
  const closed = useMemo(() => closedRoomColliders(level), [level]);
  return (
    <RigidBody type="fixed" colliders={false}>
      <Boxes boxes={boxes} />
      {floor && <TrimeshCollider args={[floor.vertices, floor.indices]} />}
      {closed && <TrimeshCollider args={[closed.vertices, closed.indices]} />}
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

/** Plataforma de un ascensor (se mueve con el viaje) y rejas de las paradas donde no está. */
function ElevatorColliders({ elevator }: { readonly elevator: Elevator }) {
  const store = useContext(ElevatorStoreContext);
  const state = useElevatorState(elevator.id);
  // La plataforma es un colisionador fijo que se corre en cada paso: el controlador de la persona
  // queda trabado contra un cuerpo cinemático (no camina sobre él).
  const platform = useRef<RapierCollider>(null);
  const [start] = useState(() => elevatorPlatformCollider(elevator, state.offset));
  useBeforePhysicsStep(() => {
    const at = elevatorPlatformCollider(elevator, store?.get(elevator.id).offset ?? 0).position;
    platform.current?.setTranslationWrtParent({ x: at[0], y: at[1], z: at[2] });
  });
  // Las puertas como obstáculo cambian solo al cerrarse o abrirse del todo, no en cada paso.
  const closedKey = closedStops(elevator, state)
    .map((s) => s.levelId)
    .join(' ');
  const gates = useMemo(() => {
    const closed = new Set(closedKey.split(' '));
    return elevatorDoorColliders(elevator, (stop) => closed.has(stop.levelId));
  }, [closedKey, elevator]);
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          ref={platform}
          args={start.halfExtents}
          position={start.position}
          rotation={[0, start.rotationY, 0]}
        />
      </RigidBody>
      {gates.length > 0 && (
        <RigidBody key={gates.map((g) => g.position[1]).join(' ')} type="fixed" colliders={false}>
          <Boxes boxes={gates} />
        </RigidBody>
      )}
    </>
  );
}

function PersonController({
  level,
  levels,
  elevators,
  onLevelChange,
  onNearbyElevator,
  onElevatorPanel,
  travelRef,
  elevatorRef,
  selection,
  profile,
  onPointerLockChange,
  walkStart,
  headBob = false,
  virtualInput,
}: NavigationModeProps & { readonly elevators: readonly Elevator[] }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const elevatorStore = useContext(ElevatorStoreContext);
  // Sobre una escalera, adelante y atrás siguen su línea de paso (ver `stair-guide`).
  const guides = useMemo(() => stairGuides(levels), [levels]);
  const turned = useRef(false);
  const guideState = useRef(newGuideState());
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
    // En un ascensor que viaja, la persona va parada sobre la plataforma.
    const feet = { x: t.x * 1000, y: -t.z * 1000 };
    const riding =
      elevatorStore && elevatorUnder(elevators, elevatorStore, feet, (t.y - dims.centerY) * 1000);
    if (riding && isMoving(elevatorStore.get(riding.id))) {
      const floor = (riding.base + elevatorStore.get(riding.id).offset) / 1000;
      motion.current.verticalSpeed = 0;
      b.setNextKinematicTranslation({
        x: t.x,
        y: floor + dims.centerY + CONTROLLER_OFFSET,
        z: t.z,
      });
      return;
    }
    const intent = readIntent();
    const guided = guidedStep(
      guides,
      [t.x, t.y - dims.centerY, t.z],
      intent.forward,
      look.current.yaw,
      guideState.current,
    );
    if (guided && guided.yawDelta !== 0) {
      look.current.yaw += guided.yawDelta;
      turned.current = true;
    }
    const next = stepPerson(
      kcc,
      c,
      t,
      motion.current,
      intent,
      look.current.yaw,
      profile,
      stepWorld.timestep,
      guided?.direction,
    );
    b.setNextKinematicTranslation(next);
  });

  // Viajar: la interfaz elige una parada del ascensor en el que está la persona.
  useEffect(() => {
    if (!travelRef) return;
    travelRef.current = (levelId) => {
      const t = body.current?.translation();
      if (!t || !elevatorStore) return false;
      const feet = { x: t.x * 1000, y: -t.z * 1000 };
      const elevator = elevatorUnder(elevators, elevatorStore, feet, (t.y - dims.centerY) * 1000);
      const stop = elevator?.stops.find((s) => s.levelId === levelId);
      if (!elevator || !stop) return false;
      elevatorStore.travel(elevator.id, stop.offset);
      return true;
    };
    return () => {
      travelRef.current = null;
    };
  }, [dims.centerY, elevatorStore, elevators, travelRef]);
  const reportedElevator = useRef('');
  const elevatorHere = useRef<ElevatorAction | null>(null);
  useEffect(() => () => onNearbyElevator?.(null), [onNearbyElevator]);

  // Usar el ascensor al alcance (E, clic con el puntero capturado o la interfaz): llamarlo a
  // esta parada o abrir su botonera.
  useEffect(() => {
    const interact = (): boolean => {
      const here = elevatorHere.current;
      if (!here || !elevatorStore) return false;
      if (here.action === 'call') elevatorStore.travel(here.elevator.id, here.stop.offset);
      else onElevatorPanel?.();
      return true;
    };
    if (elevatorRef) elevatorRef.current = interact;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.code !== 'KeyE') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      interact();
    };
    const canvas = gl.domElement;
    const onPointerDown = () => {
      if (document.pointerLockElement === canvas) interact();
    };
    window.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('pointerdown', onPointerDown);
    return () => {
      if (elevatorRef) elevatorRef.current = null;
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
  }, [elevatorRef, elevatorStore, gl, onElevatorPanel]);

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
    // La mirada que giró la escalera.
    if (turned.current) {
      turned.current = false;
      camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ');
    }
    // La planta en la que está la persona: la más alta cuyo piso alcanzan los pies.
    const here = levelAtFeet(levels, (t.y - dims.centerY) * 1000);
    if (here && here.id !== reportedLevel.current) {
      reportedLevel.current = here.id;
      onLevelChange?.(here.id);
    }
    // El ascensor al alcance: llamarlo desde afuera o usar su botonera desde adentro.
    if (!elevatorStore) return;
    const yaw = look.current.yaw;
    const reach = elevatorAction(
      elevators,
      elevatorStore,
      { x: t.x * 1000, y: -t.z * 1000 },
      (t.y - dims.centerY) * 1000,
      { x: -Math.sin(yaw), y: Math.cos(yaw) },
    );
    elevatorHere.current = reach;
    const report = reach ? `${reach.elevator.id}:${reach.action}:${reach.stop.levelId}` : '';
    if (report === reportedElevator.current) return;
    reportedElevator.current = report;
    onNearbyElevator?.(
      reach
        ? {
            action: reach.action,
            stops: reach.elevator.stops.map(({ levelId, name }) => ({ levelId, name })),
            current: reach.stop.levelId,
          }
        : null,
    );
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={spawnCenter}>
      <CapsuleCollider ref={collider} args={[dims.halfHeight, dims.radius]} />
    </RigidBody>
  );
}
