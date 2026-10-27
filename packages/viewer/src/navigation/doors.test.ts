import {
  addOpening,
  createEmptyProject,
  createRectangularRoom,
  executeCommand,
  levelWallFootprints,
  sequentialIds,
  type Level,
  type Params,
} from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { closedDoorColliders, wallChunks } from './colliders';
import { canClose, createDoorStore, DOOR_TRAVEL_S, doorCenter, nearestDoor } from './doors';

/** Recinto de 4 × 3 m con una puerta batiente (abierta o cerrada en el documento) al sur. */
function levelWithDoor(params: Params = {}): Level {
  const ids = sequentialIds();
  let project = createEmptyProject({ name: 'P', levelName: 'L', generator: 'test', ids });
  const levelId = project.levels[0]!.id;
  project = executeCommand(
    project,
    createRectangularRoom,
    {
      levelId,
      name: 'R',
      origin: { x: 0, y: 0 },
      width: 4000,
      depth: 3000,
      height: 2400,
      thickness: 150,
    },
    { ids },
  ).project;
  const level = project.levels[0]!;
  const south = level.walls.find((w) => {
    const a = level.nodes.find((n) => n.id === w.start)!;
    const b = level.nodes.find((n) => n.id === w.end)!;
    return a.y < 0 && b.y < 0;
  })!;
  project = executeCommand(
    project,
    addOpening,
    {
      levelId,
      wallId: south.id,
      def: 'door.single@1',
      params: { width: 800, height: 2000, hinge: 'start', swing: 'left', openAngle: 90, ...params },
    },
    { ids },
  ).project;
  return project.levels[0]!;
}

describe('puertas del recorrido', () => {
  it('empiezan como en el documento: abiertas (sin colisión) o cerradas (con colisión)', () => {
    const open = levelWithDoor();
    const closed = levelWithDoor({ openAngle: 0 });
    expect(createDoorStore().closedIds(open)).toEqual([]);
    expect(createDoorStore().closedIds(closed)).toEqual([closed.openings[0]!.id]);
  });

  it('se cierran animando y recién cerradas del todo tienen colisión', () => {
    const level = levelWithDoor();
    const door = level.openings[0]!;
    const store = createDoorStore();
    store.toggle(door);
    expect(store.get(door)).toEqual({ openness: 1, target: 0 });
    store.step(DOOR_TRAVEL_S / 2);
    expect(store.get(door).openness).toBeCloseTo(0.5);
    // Moviéndose se atraviesa.
    expect(store.closedIds(level)).toEqual([]);
    store.step(DOOR_TRAVEL_S);
    expect(store.closedIds(level)).toEqual([door.id]);
    // Al empezar a abrir, ya se atraviesa.
    store.toggle(door);
    expect(store.closedIds(level)).toEqual([]);
  });

  it('la colisión de una puerta cerrada tapa el vano (el muro le deja el paso)', () => {
    const level = levelWithDoor({ openAngle: 0 });
    const door = level.openings[0]!;
    const [box] = closedDoorColliders(level, [door.id]);
    expect(box?.halfExtents[0]).toBeCloseTo(0.4);
    expect(box?.halfExtents[1]).toBeCloseTo(1);
    expect(box?.position[1]).toBeCloseTo(1);
    const wall = level.walls.find((w) => w.id === door.wallId)!;
    const chunks = wallChunks(level, wall, 4150);
    // Sobre el vano solo queda el dintel: la hoja es la que bloquea.
    expect(chunks.some((c) => c.bottom === 2000)).toBe(true);
  });

  it('la puerta al alcance es la de enfrente; de espaldas o lejos, ninguna', () => {
    const level = levelWithDoor();
    const footprints = levelWallFootprints(level);
    const door = level.openings[0]!;
    const c = doorCenter(door, footprints.get(door.wallId)!);
    const inside = { x: c.x, y: c.y + 1200 };
    expect(nearestDoor(level, footprints, inside, { x: 0, y: -1 })?.id).toBe(door.id);
    expect(nearestDoor(level, footprints, inside, { x: 0, y: 1 })).toBeNull();
    expect(nearestDoor(level, footprints, { x: c.x, y: c.y + 2500 }, { x: 0, y: -1 })).toBeNull();
  });

  it('no se cierra con la persona en el vano', () => {
    const level = levelWithDoor();
    const door = level.openings[0]!;
    const fp = levelWallFootprints(level).get(door.wallId)!;
    const c = doorCenter(door, fp);
    expect(canClose(door, fp, c, 250)).toBe(false);
    expect(canClose(door, fp, { x: c.x, y: c.y + 600 }, 250)).toBe(true);
  });
});
