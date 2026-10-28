import { describe, expect, it } from 'vitest';
import { checkIntegrity } from '../model/integrity';
import { roomsOfWall } from '../model/queries';
import { snapRoomsTranslation } from '../model/snapping';
import { createBench } from '../test-utils/fixtures';
import { createRectangularRoom, moveRooms } from './rooms';

/** Tres recintos de 3 × 3 m en fila, adosados (comparten tabiques). */
function threeInARow() {
  const bench = createBench();
  for (const x of [0, 3150, 6300]) {
    bench.run(createRectangularRoom, {
      levelId: bench.levelId,
      name: `R${x}`,
      origin: { x, y: 0 },
      width: 3000,
      depth: 3000,
      height: 2400,
      thickness: 150,
    });
  }
  return bench;
}

type Bench = ReturnType<typeof threeInARow>;
const level = (bench: Bench) => bench.project.levels[0]!;
/** Muros compartidos entre los recintos `a` y `b` (por su orden). */
function shared(bench: Bench, a: number, b: number): number {
  const l = level(bench);
  const [ra, rb] = [l.rooms[a]!.id, l.rooms[b]!.id];
  return l.walls.filter((w) => {
    const ids = roomsOfWall(l, w.id).map((r) => r.id);
    return ids.includes(ra) && ids.includes(rb);
  }).length;
}

describe('mover varios recintos', () => {
  it('lo compartido dentro del grupo sigue compartido; con los demás, se separa', () => {
    const bench = threeInARow();
    expect(shared(bench, 0, 1)).toBe(1);
    expect(shared(bench, 1, 2)).toBe(1);
    const [a, b] = level(bench).rooms;
    bench.run(moveRooms, { levelId: bench.levelId, roomIds: [a!.id, b!.id], dx: 0, dy: 4000 });
    expect(shared(bench, 0, 1)).toBe(1);
    expect(shared(bench, 1, 2)).toBe(0);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('el imán pega el grupo a los demás, no a sí mismo, y solo de cerca', () => {
    const bench = threeInARow();
    const [a, b] = level(bench).rooms;
    const ids = [a!.id, b!.id];
    // Lejos de todo: grilla; a 60 mm del tercero, se pega.
    expect(snapRoomsTranslation(level(bench), ids, { x: 0, y: 6000 }, 120).wallIds).toEqual([]);
    const near = snapRoomsTranslation(level(bench), ids, { x: -60, y: 0 }, 120);
    expect(near.delta.x).toBe(0);
    expect(near.wallIds.length).toBeGreaterThan(0);
  });
});
