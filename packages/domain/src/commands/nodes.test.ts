import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors';
import { checkIntegrity } from '../model/integrity';
import { requireLevel, requireRoom, roomSideLengths, roomsOfWall } from '../model/queries';
import { snapNodePosition } from '../model/snapping';
import { benchWithRoom, createBench } from '../test-utils/fixtures';
import { createRectangularRoom, moveNode } from './rooms';

describe('mover nodos', () => {
  it('mover un vértice cambia la forma del recinto', () => {
    const bench = benchWithRoom();
    const level = requireLevel(bench.project, bench.levelId);
    const room = requireRoom(level, bench.roomId);
    // Nodo noreste (eje en 4075, 3075): se aleja 1 m al este → trapecio.
    const ne = level.nodes.find((n) => n.x === 4075 && n.y === 3075)!;
    bench.run(moveNode, { levelId: bench.levelId, nodeId: ne.id, x: 5075, y: 3075 });
    const after = requireLevel(bench.project, bench.levelId);
    const lengths = roomSideLengths(after, requireRoom(after, room.id)).map(Math.round);
    // El muro este queda inclinado: la esquina interior se corre algunos mm.
    expect(lengths[2]).toBeGreaterThan(4950);
    expect(lengths[2]).toBeLessThan(5000);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('un nodo compartido mueve el tabique de ambos recintos', () => {
    const bench = createBench();
    const add = (x: number) =>
      bench.run(createRectangularRoom, {
        levelId: bench.levelId,
        name: 'R',
        origin: { x, y: 0 },
        width: 3000,
        depth: 3000,
        height: 2400,
        thickness: 150,
      }).roomId;
    add(0);
    add(3150);
    const level = requireLevel(bench.project, bench.levelId);
    const shared = level.walls.find((w) => roomsOfWall(level, w.id).length === 2)!;
    for (const id of [shared.start, shared.end]) {
      const n = requireLevel(bench.project, bench.levelId).nodes.find((x) => x.id === id)!;
      bench.run(moveNode, { levelId: bench.levelId, nodeId: id, x: n.x + 500, y: n.y });
    }
    const after = requireLevel(bench.project, bench.levelId);
    const [a, b] = after.rooms.map((r) => roomSideLengths(after, r).map(Math.round)[0]);
    expect([a, b]).toEqual([3500, 2500]);
  });

  it('rechaza posiciones que cruzan el contorno', () => {
    const bench = benchWithRoom();
    const level = requireLevel(bench.project, bench.levelId);
    const ne = level.nodes.find((n) => n.x === 4075 && n.y === 3075)!;
    expect(() =>
      // El lado norte cruzaría al lado sur.
      bench.run(moveNode, { levelId: bench.levelId, nodeId: ne.id, x: 2000, y: -2000 }),
    ).toThrow(DomainError);
  });

  it('alinea el nodo con sus vecinos para dejar muros a escuadra', () => {
    const bench = benchWithRoom();
    const level = requireLevel(bench.project, bench.levelId);
    const ne = level.nodes.find((n) => n.x === 4075 && n.y === 3075)!;
    expect(snapNodePosition(level, ne.id, { x: 4140, y: 3011 })).toEqual({ x: 4075, y: 3075 });
    expect(snapNodePosition(level, ne.id, { x: 4804, y: 3011 })).toEqual({ x: 4800, y: 3075 });
  });
});
