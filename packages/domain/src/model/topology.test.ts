import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createRectangularRoom,
  deleteRoom,
  moveRoom,
  setRoomSideLength,
  setWallThickness,
} from '../commands';
import { createBench, type TestBench } from '../test-utils/fixtures';
import { checkIntegrity } from './integrity';
import { TOPOLOGY_TOLERANCE } from './topology';
import {
  requireLevel,
  requireRoom,
  roomMetrics,
  roomOnWallFace,
  roomSides,
  roomsOfWall,
  wallFaceTowardRoom,
  wallSideLabel,
} from './queries';

const T = 150;

function addRoom(
  bench: TestBench,
  name: string,
  x: number,
  y: number,
  width: number,
  depth: number,
) {
  return bench.run(createRectangularRoom, {
    levelId: bench.levelId,
    name,
    origin: { x, y },
    width,
    depth,
    height: 2400,
    thickness: T,
  }).roomId;
}

const level = (bench: TestBench) => requireLevel(bench.project, bench.levelId);
const sideLengths = (bench: TestBench, roomId: string) =>
  roomSides(level(bench), requireRoom(level(bench), roomId)).map((s) => Math.round(s.length));
const sharedWalls = (bench: TestBench) =>
  level(bench).walls.filter((w) => roomsOfWall(level(bench), w.id).length > 1);

describe('muros compartidos', () => {
  it('dos recintos adosados (separados por un espesor) comparten un solo muro', () => {
    const bench = createBench();
    const a = addRoom(bench, 'A', 0, 0, 4000, 3000);
    const b = addRoom(bench, 'B', 4000 + T, 0, 3000, 3000);
    const lvl = level(bench);
    expect(lvl.walls).toHaveLength(7);
    expect(lvl.nodes).toHaveLength(6);
    expect(sharedWalls(bench)).toHaveLength(1);
    // Las medidas interiores no cambian por compartir el muro.
    expect(roomMetrics(lvl, requireRoom(lvl, a)).area).toBeCloseTo(12e6, 0);
    expect(roomMetrics(lvl, requireRoom(lvl, b)).area).toBeCloseTo(9e6, 0);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('un vecino más corto divide el muro en T y el lado conserva su numeración', () => {
    const bench = createBench();
    const a = addRoom(bench, 'A', 0, 0, 4000, 5000);
    addRoom(bench, 'B', 4000 + T, 1000, 3000, 2000);
    const lvl = level(bench);
    const room = requireRoom(lvl, a);
    expect(room.boundary).toHaveLength(6);
    expect(sideLengths(bench, a)).toEqual([4000, 5000, 4000, 5000]);
    const east = roomSides(lvl, room)[1]!;
    expect(east.wallIds).toHaveLength(3);
    expect(wallSideLabel(lvl, room, east.wallIds[1]!)).toEqual({ side: 2, part: 2 });
    expect(sharedWalls(bench)).toHaveLength(1);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('solapes parciales en ambos sentidos se resuelven', () => {
    const bench = createBench();
    addRoom(bench, 'A', 0, 0, 4000, 4000);
    addRoom(bench, 'B', 4000 + T, 2000, 3000, 4000);
    expect(sharedWalls(bench)).toHaveLength(1);
    const shared = sharedWalls(bench)[0]!;
    const positions = new Map(level(bench).nodes.map((n) => [n.id, n]));
    const ys = [positions.get(shared.start)!.y, positions.get(shared.end)!.y].sort((p, q) => p - q);
    // Tramo común: del arranque de B (2000 − 75) al final de A (4000 + 75).
    expect(ys).toEqual([2000 - T / 2, 4000 + T / 2]);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('cada cara del muro compartido mira a un recinto distinto', () => {
    const bench = createBench();
    const a = addRoom(bench, 'A', 0, 0, 4000, 3000);
    const b = addRoom(bench, 'B', 4000 + T, 0, 3000, 3000);
    const lvl = level(bench);
    const wall = sharedWalls(bench)[0]!;
    const faceA = wallFaceTowardRoom(lvl, requireRoom(lvl, a), wall.id);
    const faceB = wallFaceTowardRoom(lvl, requireRoom(lvl, b), wall.id);
    expect(faceA).not.toBeNull();
    expect(faceB).not.toBe(faceA);
    expect(roomOnWallFace(lvl, wall.id, faceA!)?.id).toBe(a);
    expect(roomOnWallFace(lvl, wall.id, faceB!)?.id).toBe(b);
  });

  it('mover un recinto lo separa y el vecino recupera su muro entero', () => {
    const bench = createBench();
    const a = addRoom(bench, 'A', 0, 0, 4000, 5000);
    const b = addRoom(bench, 'B', 4000 + T, 1000, 3000, 2000);
    bench.run(moveRoom, { levelId: bench.levelId, roomId: b, dx: 2000, dy: 0 });
    const lvl = level(bench);
    expect(requireRoom(lvl, a).boundary).toHaveLength(4);
    expect(lvl.walls).toHaveLength(8);
    expect(sharedWalls(bench)).toHaveLength(0);
    expect(sideLengths(bench, b)).toEqual([3000, 2000, 3000, 2000]);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('deslizar un recinto a lo largo del vecino mantiene el muro compartido', () => {
    const bench = createBench();
    addRoom(bench, 'A', 0, 0, 4000, 5000);
    const b = addRoom(bench, 'B', 4000 + T, 1000, 3000, 2000);
    bench.run(moveRoom, { levelId: bench.levelId, roomId: b, dx: 0, dy: 1500 });
    expect(sharedWalls(bench)).toHaveLength(1);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('mover un recinto hasta adosarlo crea el muro compartido', () => {
    const bench = createBench();
    addRoom(bench, 'A', 0, 0, 4000, 3000);
    const b = addRoom(bench, 'B', 6000, 0, 3000, 3000);
    expect(sharedWalls(bench)).toHaveLength(0);
    bench.run(moveRoom, { levelId: bench.levelId, roomId: b, dx: 4000 + T - 6000, dy: 0 });
    expect(sharedWalls(bench)).toHaveLength(1);
    expect(level(bench).walls).toHaveLength(7);
  });

  it('eliminar un recinto deja al vecino con sus muros enteros', () => {
    const bench = createBench();
    const a = addRoom(bench, 'A', 0, 0, 4000, 5000);
    const b = addRoom(bench, 'B', 4000 + T, 1000, 3000, 2000);
    bench.run(deleteRoom, { levelId: bench.levelId, roomId: b });
    const lvl = level(bench);
    expect(lvl.walls).toHaveLength(4);
    expect(requireRoom(lvl, a).boundary).toHaveLength(4);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('empujar un muro compartido ajusta a ambos recintos', () => {
    const bench = createBench();
    const a = addRoom(bench, 'A', 0, 0, 4000, 3000);
    const b = addRoom(bench, 'B', 4000 + T, 0, 3000, 3000);
    // Lado 1 (sur) de A a 4,50 m: el tabique se corre 50 cm hacia B.
    bench.run(setRoomSideLength, { levelId: bench.levelId, roomId: a, sideIndex: 0, length: 4500 });
    expect(sideLengths(bench, a)).toEqual([4500, 3000, 4500, 3000]);
    expect(sideLengths(bench, b)).toEqual([2500, 3000, 2500, 3000]);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('empujar una fachada alineada mueve toda la línea de muro', () => {
    const bench = createBench();
    const a = addRoom(bench, 'A', 0, 0, 4000, 3000);
    const b = addRoom(bench, 'B', 0, 3000 + T, 4000, 2000);
    bench.run(setRoomSideLength, { levelId: bench.levelId, roomId: a, sideIndex: 0, length: 4600 });
    // B sigue siendo rectángulo y se ensancha con la fachada este.
    expect(sideLengths(bench, a)).toEqual([4600, 3000, 4600, 3000]);
    expect(sideLengths(bench, b)).toEqual([4600, 2000, 4600, 2000]);
  });

  it('el espesor de un muro compartido afecta a los dos recintos', () => {
    const bench = createBench();
    const a = addRoom(bench, 'A', 0, 0, 4000, 3000);
    const b = addRoom(bench, 'B', 4000 + T, 0, 3000, 3000);
    const wall = sharedWalls(bench)[0]!;
    bench.run(setWallThickness, { levelId: bench.levelId, wallId: wall.id, thickness: 250 });
    expect(sideLengths(bench, a)[0]).toBe(3950);
    expect(sideLengths(bench, b)[0]).toBe(2950);
  });

  it('propiedad: adosar en cualquier punto del lado deja el documento íntegro', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -2500, max: 4500 }),
        fc.integer({ min: 500, max: 3000 }),
        (y, depth) => {
          const bench = createBench();
          const a = addRoom(bench, 'A', 0, 0, 4000, 4000);
          const b = addRoom(bench, 'B', 4000 + T, y, 2500, depth);
          expect(checkIntegrity(bench.project)).toEqual([]);
          expect(sideLengths(bench, a)).toEqual([4000, 4000, 4000, 4000]);
          // Los nodos a menos de la tolerancia se fusionan: el error queda acotado por ella.
          sideLengths(bench, b).forEach((length, i) =>
            expect(Math.abs(length - [2500, depth][i % 2]!)).toBeLessThanOrEqual(
              TOPOLOGY_TOLERANCE,
            ),
          );
          // Los ejes deben solaparse más que la tolerancia para compartir un tramo.
          const overlaps = y < 4000 + T - TOPOLOGY_TOLERANCE && y + depth + T > TOPOLOGY_TOLERANCE;
          expect(sharedWalls(bench).length).toBe(overlaps ? 1 : 0);
        },
      ),
      { numRuns: 60 },
    );
  });
});
