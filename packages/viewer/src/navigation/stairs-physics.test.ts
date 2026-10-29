import RAPIER from '@dimforge/rapier3d-compat';
import { spiralWalkRadius } from '@decodeny/catalog';
import {
  addItem,
  addLevel,
  createEmptyProject,
  createRectangularRoom,
  executeCommand,
  sequentialIds,
  type Project,
} from '@decodeny/domain';
import { Euler, Quaternion } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { planToWorld } from '../coords';
import { levelSlab } from '../scene/slabs';
import { assistStep, newGuideState, stairGuides } from './stair-guide';
import {
  groundCollider,
  itemColliders,
  levelAtFeet,
  slabCollider,
  wallColliders,
} from './colliders';
import { horizontalDirection, NO_MOVEMENT, type MovementIntent } from './input';
import { capsuleDimensions, DEFAULT_PERSON } from './person-profile';
import {
  configurePersonController,
  stepPerson,
  FLOOR_COLLISION_GROUPS,
  type PersonMotionState,
} from './person-step';

/**
 * Integración con Rapier (I12): con las colisiones de todas las plantas y la asistencia de las
 * escaleras (como en el recorrido), la persona sube una escalera caminando, llega al piso de
 * arriba y la planta en la que está cambia.
 */
beforeAll(async () => {
  await RAPIER.init();
});

const DT = 1 / 60;

/** Rumbo fijo o según la posición (planta, mm) y el tiempo (s). 0 = norte, −π/2 = este. */
type Route = number | ((at: { x: number; y: number }, time: number) => number);

/** Rumbo hacia una dirección de la planta. */
const heading = (x: number, y: number) => Math.atan2(-x, y);

/** Recinto de 4 × 6 m con una planta igual arriba (piso a 2,80 m) y una escalera entre ambas. */
function twoStoreys(def: string, params: Record<string, number | string>): Project {
  const ids = sequentialIds();
  let project = createEmptyProject({ name: 'P', levelName: 'Piso 1', generator: 'test', ids });
  const ground = project.levels[0]!.id;
  const run = <A>(command: Parameters<typeof executeCommand<A, unknown>>[1], args: A) =>
    (project = executeCommand(project, command, args, { ids }).project);
  run(createRectangularRoom, {
    levelId: ground,
    name: 'R',
    origin: { x: 0, y: 0 },
    width: 4000,
    depth: 6000,
    height: 2600,
    thickness: 150,
  });
  run(addLevel, { name: 'Piso 2', copyOutlineFrom: ground });
  run(addItem, {
    levelId: ground,
    def,
    params: { height: 2800, ...params },
    position: { x: 2000, y: 3000 },
    rotation: 0,
  });
  return project;
}

function walk(
  project: Project,
  start: { x: number; y: number },
  route: Route,
  seconds: number,
  elevation = 0,
) {
  const guides = stairGuides(project.levels);
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const [i, level] of project.levels.entries()) {
    const boxes = [...wallColliders(level), ...itemColliders(level)];
    if (i === 0) boxes.push(groundCollider(level));
    for (const box of boxes) {
      const q = new Quaternion().setFromEuler(new Euler(box.pitch ?? 0, box.rotationY, 0, 'YXZ'));
      const desc = RAPIER.ColliderDesc.cuboid(...box.halfExtents)
        .setTranslation(...box.position)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      if (box.walkway) desc.setCollisionGroups(FLOOR_COLLISION_GROUPS);
      world.createCollider(desc, fixed);
    }
    const below = levelSlab(project.levels, level).below;
    const floor = i > 0 && below ? slabCollider(level, below) : null;
    if (floor)
      world.createCollider(
        RAPIER.ColliderDesc.trimesh(floor.vertices, floor.indices).setCollisionGroups(
          FLOOR_COLLISION_GROUPS,
        ),
        fixed,
      );
  }
  const dims = capsuleDimensions(DEFAULT_PERSON);
  const feet = planToWorld(start);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      feet[0],
      elevation / 1000 + dims.centerY,
      feet[2],
    ),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(dims.halfHeight, dims.radius),
    body,
  );
  const controller = world.createCharacterController(0.02);
  configurePersonController(controller, DEFAULT_PERSON);
  world.step();

  const intent: MovementIntent = { ...NO_MOVEMENT, forward: 1 };
  const state: PersonMotionState = { verticalSpeed: 0 };
  const steps = Math.round(seconds / DT);
  // Lo que la escalera giró la mirada, sumado al rumbo de la ruta.
  let turned = 0;
  const guideState = newGuideState();
  /** Velocidad (m/s, a lo largo de la escalera) y altura de los pies en cada paso. */
  const track: { speed: number; feet: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const at = body.translation();
    const yaw =
      turned +
      (typeof route === 'number' ? route : route({ x: at.x * 1000, y: -at.z * 1000 }, i * DT));
    const assisted = assistStep(
      guides,
      [at.x, at.y - dims.centerY, at.z],
      horizontalDirection(intent, yaw),
      dims.radius + 0.02,
      guideState,
    );
    if (assisted) turned += assisted.yawDelta;
    const next = stepPerson(
      controller,
      collider,
      body.translation(),
      state,
      intent,
      yaw,
      DEFAULT_PERSON,
      DT,
      assisted?.direction,
      assisted?.footing,
    );
    body.setNextKinematicTranslation(next);
    world.step();
    const now = body.translation();
    const speed = Math.hypot(now.x - at.x, now.y - at.y, now.z - at.z) / DT;
    track.push({ speed, feet: now.y - dims.centerY });
  }
  const t = body.translation();
  world.free();
  return { x: t.x, z: t.z, feet: t.y - dims.centerY, track };
}

describe('escaleras en el recorrido', () => {
  it('se sube caminando una escalera recta hasta el piso de arriba', () => {
    const project = twoStoreys('stairs.straight@1', { width: 1000 });
    // Desde el sur del recinto, mirando al norte (−Z): la escalera sube hacia el norte.
    const r = walk(project, { x: 2000, y: 400 }, 0, 9);
    expect(r.feet).toBeCloseTo(2.8, 1);
    expect(levelAtFeet(project.levels, r.feet * 1000)?.name).toBe('Piso 2');
    // Llegó al fondo, más allá del hueco (que termina en y = 5,10 m de la planta).
    expect(-r.z).toBeGreaterThan(5.1);
  });

  it('caminando al lado de la escalera se queda en la planta baja', () => {
    const project = twoStoreys('stairs.straight@1', { width: 1000 });
    const r = walk(project, { x: 700, y: 400 }, 0, 6);
    expect(r.feet).toBeCloseTo(0, 1);
    expect(levelAtFeet(project.levels, r.feet * 1000)?.name).toBe('Piso 1');
  });

  it('se baja por la escalera desde la planta de arriba', () => {
    const project = twoStoreys('stairs.straight@1', { width: 1000 });
    // Arriba, al norte del hueco, mirando al sur: la llegada no tiene baranda.
    const r = walk(project, { x: 2000, y: 5600 }, Math.PI, 9, 2800);
    expect(r.feet).toBeCloseTo(0, 1);
    expect(levelAtFeet(project.levels, r.feet * 1000)?.name).toBe('Piso 1');
  });

  it('las barandas de arriba impiden caer por el hueco', () => {
    const project = twoStoreys('stairs.straight@1', { width: 1000 });
    // Arriba, al sur del hueco, mirando al norte: la baranda del frente lo detiene.
    const front = walk(project, { x: 2000, y: 400 }, 0, 4, 2800);
    expect(front.feet).toBeCloseTo(2.8, 1);
    expect(-front.z).toBeLessThan(0.9);
    // Al lado del hueco, el piso de arriba sostiene.
    const side = walk(project, { x: 700, y: 400 }, 0, 4, 2800);
    expect(side.feet).toBeCloseTo(2.8, 1);
  });

  it('se sube por la escalera en U: tramo, descanso y vuelta', () => {
    const project = twoStoreys('stairs.u@1', { width: 900 });
    // Primer tramo a la izquierda (x ≈ 1,5 m) hacia el norte, descanso al fondo, segundo tramo
    // a la derecha (x ≈ 2,5 m) hacia el sur.
    const r = walk(
      project,
      { x: 1500, y: 800 },
      (at, time) =>
        time < 3 ? heading(0, 1) : at.x < 2500 && time < 4 ? heading(1, 0) : heading(0, -1),
      7,
    );
    expect(r.feet).toBeCloseTo(2.8, 1);
    expect(levelAtFeet(project.levels, r.feet * 1000)?.name).toBe('Piso 2');
  });

  it('en la caracol, avanzando hacia donde sube, se llega arriba sin frenar ni trabarse', () => {
    const project = twoStoreys('stairs.spiral@1', { diameter: 1800 });
    const center = { x: 2000, y: 3000 };
    const walkRadius = spiralWalkRadius(1800);
    // En el piso, 80 cm antes del primer peldaño (a −110°) y mirando hacia donde sube; luego,
    // solo «adelante»: la mirada acompaña el giro.
    const start = -110 * (Math.PI / 180);
    const tangent = { x: -Math.sin(start), y: Math.cos(start) };
    const r = walk(
      project,
      {
        x: center.x + walkRadius * Math.cos(start) - 800 * tangent.x,
        y: center.y + walkRadius * Math.sin(start) - 800 * tangent.y,
      },
      heading(tangent.x, tangent.y),
      9,
    );
    expect(r.feet).toBeCloseTo(2.8, 1);
    expectSmooth(r.track, 1);
  });

  it('en la caracol se baja igual de parejo desde el descanso de arriba', () => {
    const project = twoStoreys('stairs.spiral@1', { diameter: 1800 });
    const center = { x: 2000, y: 3000 };
    const walkRadius = spiralWalkRadius(1800);
    // En el descanso de arriba, 60 cm antes del primer peldaño de bajada (a −150°) y mirando
    // hacia donde baja.
    const top = -150 * (Math.PI / 180);
    const down = { x: Math.sin(top), y: -Math.cos(top) };
    const r = walk(
      project,
      {
        x: center.x + walkRadius * Math.cos(top) - 600 * down.x,
        y: center.y + walkRadius * Math.sin(top) - 600 * down.y,
      },
      heading(down.x, down.y),
      9,
      2800,
    );
    expect(r.feet).toBeCloseTo(0, 1);
    expectSmooth(r.track, -1);
  });

  it('una escalera recta se sube parejo, aunque se entre algo en diagonal', () => {
    const project = twoStoreys('stairs.straight@1', { width: 1000 });
    // Desde el sur, corrido a un costado y mirando 20° hacia el centro.
    const r = walk(project, { x: 1800, y: 400 }, heading(Math.sin(0.35), Math.cos(0.35)), 9);
    expect(r.feet).toBeCloseTo(2.8, 1);
    expectSmooth(r.track, 1);
  });

  it('mirando muy de costado no se endereza: se va hacia donde se mira', () => {
    const project = twoStoreys('stairs.straight@1', { width: 1000 });
    // Sobre el tramo, a media altura, mirando 60° hacia el este: termina contra la baranda.
    const r = walk(project, { x: 2000, y: 2400 }, heading(Math.sin(1.05), Math.cos(1.05)), 1, 1200);
    expect(r.x * 1000).toBeGreaterThan(2150);
    expect(r.feet).toBeLessThan(2.6);
  });

  it('desde arriba, mirando hacia abajo, se baja por la escalera', () => {
    const project = twoStoreys('stairs.straight@1', { width: 1000 });
    // Arriba, al norte del hueco, mirando al sur.
    const r = walk(project, { x: 2000, y: 5600 }, Math.PI, 9, 2800);
    expect(r.feet).toBeCloseTo(0, 1);
    expectSmooth(r.track, -1);
  });
});

/**
 * Subida (`sense` 1) o bajada (−1) pareja: en la escalera se va a la velocidad de caminar sin
 * tirones (no se frena contra barandas ni uniones de la rampa) y la altura nunca vuelve atrás.
 */
function expectSmooth(track: readonly { speed: number; feet: number }[], sense: 1 | -1) {
  const onStairs = track.filter((s, i) => i > 0 && s.feet > 0.05 && s.feet < 2.75);
  expect(onStairs.length).toBeGreaterThan(30);
  for (const [i, s] of onStairs.entries()) {
    expect(s.speed).toBeGreaterThan(0.9 * DEFAULT_PERSON.walkSpeed);
    expect(s.speed).toBeLessThan(1.15 * DEFAULT_PERSON.walkSpeed);
    if (i > 0) expect(Math.abs(s.speed - onStairs[i - 1]!.speed)).toBeLessThan(0.15);
  }
  for (let i = 1; i < onStairs.length; i++)
    expect((onStairs[i]!.feet - onStairs[i - 1]!.feet) * sense).toBeGreaterThan(-0.005);
}
