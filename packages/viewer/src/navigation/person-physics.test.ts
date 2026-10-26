import RAPIER from '@dimforge/rapier3d-compat';
import {
  addItem,
  addOpening,
  createEmptyProject,
  createRectangularRoom,
  executeCommand,
  roomsOfWall,
  sequentialIds,
  type Level,
} from '@decodeny/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { groundCollider, itemColliders, spawnInRoom, wallColliders } from './colliders';
import { NO_MOVEMENT, type MovementIntent } from './input';
import { capsuleDimensions, DEFAULT_PERSON } from './person-profile';
import { stepPerson, type PersonMotionState } from './person-step';

/**
 * Integración con el motor de física real (Rapier en WASM, sin navegador): verifica el
 * contrato central del modo recorrido — los muros detienen a la persona y el suelo la sostiene.
 */
beforeAll(async () => {
  await RAPIER.init();
});

const DT = 1 / 60;

function roomLevel(): Level {
  const ids = sequentialIds();
  const project = createEmptyProject({ name: 'P', levelName: 'L', generator: 'test', ids });
  return executeCommand(
    project,
    createRectangularRoom,
    {
      levelId: project.levels[0]!.id,
      name: 'R',
      origin: { x: 0, y: 0 },
      width: 4000,
      depth: 3000,
      height: 2400,
      thickness: 150,
    },
    { ids },
  ).project.levels[0]!;
}

/** Dos recintos de 4 × 3 m adosados en x = 4,075 m, con un vano a la altura del centro. */
function twoRooms(def?: string): Level {
  const ids = sequentialIds();
  let project = createEmptyProject({ name: 'P', levelName: 'L', generator: 'test', ids });
  const levelId = project.levels[0]!.id;
  for (const x of [0, 4150]) {
    project = executeCommand(
      project,
      createRectangularRoom,
      {
        levelId,
        name: 'R',
        origin: { x, y: 0 },
        width: 4000,
        depth: 3000,
        height: 2400,
        thickness: 150,
      },
      { ids },
    ).project;
  }
  if (def) {
    const level = project.levels[0]!;
    const wall = level.walls.find((w) => roomsOfWall(level, w.id).length === 2)!;
    const start = level.nodes.find((n) => n.id === wall.start)!;
    project = executeCommand(
      project,
      addOpening,
      {
        levelId,
        wallId: wall.id,
        def,
        params: { width: 900, height: 2000 },
        offset: Math.abs(1500 - start.y),
      },
      { ids },
    ).project;
  }
  return project.levels[0]!;
}

function simulate(level: Level, intent: MovementIntent, yaw: number, seconds: number) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const box of [...wallColliders(level), ...itemColliders(level), groundCollider(level)]) {
    const half = box.rotationY / 2;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(...box.halfExtents)
        .setTranslation(...box.position)
        .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
      fixed,
    );
  }
  const dims = capsuleDimensions(DEFAULT_PERSON);
  const spawn = spawnInRoom(level, level.rooms[0]!);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      spawn.feet[0],
      spawn.feet[1] + dims.centerY,
      spawn.feet[2],
    ),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(dims.halfHeight, dims.radius),
    body,
  );
  const controller = world.createCharacterController(0.02);
  controller.enableAutostep(DEFAULT_PERSON.maxStepMm / 1000, dims.radius, false);
  controller.enableSnapToGround(0.3);
  controller.setSlideEnabled(true);
  world.step();

  const state: PersonMotionState = { verticalSpeed: 0 };
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const next = stepPerson(
      controller,
      collider,
      body.translation(),
      state,
      intent,
      yaw,
      DEFAULT_PERSON,
      DT,
    );
    body.setNextKinematicTranslation(next);
    world.step();
  }
  const t = body.translation();
  world.free();
  return { x: t.x, y: t.y, z: t.z, centerY: dims.centerY, radius: dims.radius };
}

const walkForward: MovementIntent = { ...NO_MOVEMENT, forward: 1 };

describe('recorrido con física', () => {
  it('se mantiene de pie sobre el piso', () => {
    const r = simulate(roomLevel(), NO_MOVEMENT, 0, 2);
    expect(r.y).toBeCloseTo(r.centerY, 1);
  });

  it('camina a la velocidad del perfil', () => {
    // Recinto de 4 m de ancho: 1 s caminando hacia el este (yaw −90°) recorre ~1,4 m.
    const start = simulate(roomLevel(), NO_MOVEMENT, 0, 0.1);
    const after = simulate(roomLevel(), walkForward, -Math.PI / 2, 1);
    expect(after.x - start.x).toBeCloseTo(DEFAULT_PERSON.walkSpeed, 1);
  });

  it('los muros detienen a la persona', () => {
    // 10 s hacia el norte (−Z) en un recinto de 3 m: queda contra la cara interior del muro.
    const r = simulate(roomLevel(), walkForward, 0, 10);
    const northFace = -3; // cara interior norte en z = −3,00 m
    expect(r.z).toBeGreaterThan(northFace);
    expect(r.z).toBeLessThan(northFace + r.radius + 0.1);
    expect(r.y).toBeCloseTo(r.centerY, 1);
  });

  it('se desliza a lo largo del muro al avanzar en diagonal', () => {
    // Noreste contra el muro norte: avanza en x aunque z esté bloqueado.
    const r = simulate(roomLevel(), walkForward, -Math.PI / 4, 4);
    expect(r.z).toBeGreaterThan(-3);
    expect(r.x).toBeGreaterThan(3);
    expect(r.x).toBeLessThan(4);
  });

  it('atraviesa una puerta hacia el recinto vecino', () => {
    // 5 s hacia el este desde el centro del primer recinto: cruza el vano del tabique.
    const r = simulate(twoRooms('door.single@1'), walkForward, -Math.PI / 2, 5);
    expect(r.x).toBeGreaterThan(4.3);
  });

  it('sin puerta, o con una ventana, el tabique lo detiene', () => {
    for (const level of [twoRooms(), twoRooms('window.floor@1')]) {
      const r = simulate(level, walkForward, -Math.PI / 2, 5);
      expect(r.x).toBeLessThan(4);
    }
  });

  it('los muebles bloquean el paso y la aparición los evita', () => {
    const base = roomLevel();
    const project = executeCommand(
      { ...createEmptyProject({ name: 'P', levelName: 'L', generator: 't' }), levels: [base] },
      addItem,
      {
        levelId: base.id,
        def: 'furniture.bed@1',
        params: { width: 1400, depth: 2000, height: 1000 },
        position: { x: 3000, y: 1500 },
        rotation: 90,
      },
      { ids: sequentialIds() },
    ).project;
    // La cama ocupa x ∈ [2,0; 4,0] m: caminando al este, la persona se detiene antes.
    const r = simulate(project.levels[0]!, walkForward, -Math.PI / 2, 5);
    expect(r.x).toBeLessThan(2.0 - r.radius + 0.05);
    expect(r.x).toBeGreaterThan(1.0);
  });
});
