import RAPIER from '@dimforge/rapier3d-compat';
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
import {
  elevatorGateColliders,
  elevatorPlatformCollider,
  groundCollider,
  itemColliders,
  slabCollider,
  wallColliders,
  type BoxCollider,
} from './colliders';
import {
  createElevatorStore,
  currentStop,
  ELEVATOR_SPEED,
  elevatorUnder,
  gatedStops,
  projectElevators,
} from './elevators';
import { NO_MOVEMENT } from './input';
import { capsuleDimensions, DEFAULT_PERSON } from './person-profile';
import { configurePersonController, stepPerson, type PersonMotionState } from './person-step';

beforeAll(async () => {
  await RAPIER.init();
});

/** Recinto de 4 × 6 m en tres plantas (pisos a 0, 2,80 y 5,60 m) con un ascensor de 3 paradas. */
function building(): Project {
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
  run(addLevel, { name: 'Piso 3', copyOutlineFrom: ground });
  run(addItem, {
    levelId: ground,
    def: 'structure.elevator@1',
    params: { stops: 3, height: 5600 },
    position: { x: 2000, y: 3000 },
    rotation: 0,
  });
  return project;
}

describe('ascensores', () => {
  it('tiene una parada por planta servida y la plataforma viaja entre ellas', () => {
    const [elevator] = projectElevators(building().levels);
    expect(elevator!.stops.map((s) => [s.name, s.offset])).toEqual([
      ['Piso 1', 0],
      ['Piso 2', 2800],
      ['Piso 3', 5600],
    ]);
    const store = createElevatorStore();
    expect(currentStop(elevator!, store.get(elevator!.id))?.name).toBe('Piso 1');
    expect(gatedStops(elevator!, store.get(elevator!.id)).map((s) => s.name)).toEqual([
      'Piso 2',
      'Piso 3',
    ]);
    store.travel(elevator!.id, 2800);
    // Mientras viaja, todas las paradas tienen reja.
    store.step(1);
    expect(store.get(elevator!.id).offset).toBe(ELEVATOR_SPEED);
    expect(gatedStops(elevator!, store.get(elevator!.id))).toHaveLength(3);
    store.step(5);
    expect(currentStop(elevator!, store.get(elevator!.id))?.name).toBe('Piso 2');
  });

  it('se sabe quién está en la plataforma (en planta y a su altura)', () => {
    const [elevator] = projectElevators(building().levels);
    const store = createElevatorStore();
    const inside = { x: 2000, y: 3000 };
    expect(elevatorUnder([elevator!], store, inside, 0)).toBe(elevator);
    expect(elevatorUnder([elevator!], store, inside, 2800)).toBeUndefined();
    expect(elevatorUnder([elevator!], store, { x: 500, y: 500 }, 0)).toBeUndefined();
  });

  it('con la plataforma arriba, la persona se para en ella; abajo, la reja cierra el ducto', () => {
    const project = building();
    const [elevator] = projectElevators(project.levels);
    const store = createElevatorStore();
    store.travel(elevator!.id, 2800);
    store.step(10);

    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const add = (box: BoxCollider) => {
      const q = new Quaternion().setFromEuler(new Euler(box.pitch ?? 0, box.rotationY, 0, 'YXZ'));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(...box.halfExtents)
          .setTranslation(...box.position)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
        fixed,
      );
    };
    for (const [i, level] of project.levels.entries()) {
      [...wallColliders(level), ...itemColliders(level)].forEach(add);
      if (i === 0) add(groundCollider(level));
      const below = levelSlab(project.levels, level).below;
      const floor = i > 0 && below ? slabCollider(level, below) : null;
      if (floor) {
        world.createCollider(RAPIER.ColliderDesc.trimesh(floor.vertices, floor.indices), fixed);
      }
    }
    add(elevatorPlatformCollider(elevator!, store.get(elevator!.id).offset));
    elevatorGateColliders(elevator!, store.get(elevator!.id)).forEach(add);

    const dims = capsuleDimensions(DEFAULT_PERSON);
    const controller = world.createCharacterController(0.02);
    configurePersonController(controller, DEFAULT_PERSON);
    const simulate = (start: { x: number; y: number }, elevation: number, yaw: number) => {
      const feet = planToWorld(start);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          feet[0],
          elevation / 1000 + dims.centerY + 0.05,
          feet[2],
        ),
      );
      const collider = world.createCollider(
        RAPIER.ColliderDesc.capsule(dims.halfHeight, dims.radius),
        body,
      );
      world.step();
      const state: PersonMotionState = { verticalSpeed: 0 };
      const intent = { ...NO_MOVEMENT, forward: 1 };
      for (let i = 0; i < 180; i++) {
        body.setNextKinematicTranslation(
          stepPerson(
            controller,
            collider,
            body.translation(),
            state,
            intent,
            yaw,
            DEFAULT_PERSON,
            1 / 60,
          ),
        );
        world.step();
      }
      const t = body.translation();
      world.removeRigidBody(body);
      return { x: t.x, z: t.z, feet: t.y - dims.centerY };
    };
    // Dentro de la cabina, en el Piso 2: sobre la plataforma.
    expect(simulate({ x: 2000, y: 3100 }, 2800, 0).feet).toBeCloseTo(2.8, 1);
    // En el Piso 1, caminando hacia el ducto (al norte, desde el frente): la reja lo detiene.
    const blocked = simulate({ x: 2000, y: 1500 }, 0, 0);
    expect(blocked.feet).toBeCloseTo(0, 1);
    expect(-blocked.z).toBeLessThan(2.4);
    world.free();
  });
});
