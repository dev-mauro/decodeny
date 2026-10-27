import { describe, expect, it } from 'vitest';
import { addWall, createRectangularRoom } from '../commands';
import { createBench } from '../test-utils/fixtures';
import { levelWallExposure, requireLevel, roomsOfWall, type WallExposure } from './queries';

function twoRoomsAndAFreeWall() {
  const bench = createBench();
  for (const [name, x] of [
    ['A', 0],
    ['B', 4150],
  ] as const) {
    bench.run(createRectangularRoom, {
      levelId: bench.levelId,
      name,
      origin: { x, y: 0 },
      width: 4000,
      depth: 3000,
      height: 2400,
      thickness: 150,
    });
  }
  bench.run(addWall, { levelId: bench.levelId, from: { x: 0, y: 6000 }, to: { x: 3000, y: 6000 } });
  return requireLevel(bench.project, bench.levelId);
}

describe('levelWallExposure', () => {
  const level = twoRoomsAndAFreeWall();
  const exposure = levelWallExposure(level);
  const byKind = (kind: WallExposure['kind']) =>
    [...exposure.entries()].filter(([, e]) => e.kind === kind).map(([id]) => id);

  it('clasifica el tabique compartido como interior y el muro sin recintos como suelto', () => {
    expect(byKind('interior')).toEqual(
      level.walls.filter((w) => roomsOfWall(level, w.id).length === 2).map((w) => w.id),
    );
    expect(byKind('free')).toHaveLength(1);
    expect(byKind('exterior')).toHaveLength(level.walls.length - 2);
  });

  it('la normal de un muro exterior apunta hacia afuera de la casa', () => {
    const center = { x: 4075, y: 1500 };
    for (const id of byKind('exterior')) {
      const e = exposure.get(id);
      if (e?.kind !== 'exterior') throw new Error('esperaba un muro exterior');
      const toCenter = { x: center.x - e.mid.x, y: center.y - e.mid.y };
      expect(e.outward.x * toCenter.x + e.outward.y * toCenter.y).toBeLessThan(0);
      expect(Math.hypot(e.outward.x, e.outward.y)).toBeCloseTo(1);
    }
  });
});
