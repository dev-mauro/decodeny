import {
  createEmptyProject,
  createRectangularRoom,
  executeCommand,
  sequentialIds,
  setRoomUninhabitable,
} from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { chooseSpawn, closedRoomColliders, roomAt } from './colliders';

function twoRooms(closedSecond: boolean) {
  const ids = sequentialIds();
  let project = createEmptyProject({ name: 'P', levelName: 'L', generator: 'test', ids });
  const levelId = project.levels[0]!.id;
  for (const x of [0, 4150]) {
    project = executeCommand(
      project,
      createRectangularRoom,
      {
        levelId,
        name: `R${x}`,
        origin: { x, y: 0 },
        width: 4000,
        depth: 3000,
        height: 2400,
        thickness: 150,
      },
      { ids },
    ).project;
  }
  if (closedSecond) {
    const roomId = project.levels[0]!.rooms[1]!.id;
    project = executeCommand(
      project,
      setRoomUninhabitable,
      { levelId, roomId, uninhabitable: true },
      { ids },
    ).project;
  }
  return project.levels[0]!;
}

describe('espacios no habitables en el recorrido', () => {
  it('se cercan por su contorno interior y no se aparece en ellos', () => {
    expect(closedRoomColliders(twoRooms(false))).toBeNull();
    const level = twoRooms(true);
    const fence = closedRoomColliders(level)!;
    // Un rectángulo: cuatro caras de dos triángulos.
    expect(fence.indices.length).toBe(4 * 6);
    expect(roomAt(level, { x: 6000, y: 1500 })).toBeUndefined();
    expect(roomAt(level, { x: 2000, y: 1500 })?.name).toBe('R0');
    const spawn = chooseSpawn(
      level,
      { kind: 'room', id: level.rooms[1]!.id },
      { position: { x: 100, z: 100 } },
      0,
    );
    // Seleccionado el no habitable, aparece en el otro.
    expect(spawn.feet[0]).toBeLessThan(4.1);
  });
});
