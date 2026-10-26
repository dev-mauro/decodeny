import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors';
import { checkIntegrity } from '../model/integrity';
import {
  openingGaps,
  openingOffsetForGap,
  openingOffsetRange,
  openingSpan,
} from '../model/openings';
import { requireLevel, roomSides, roomsOfWall, wallFaceTowardRoom } from '../model/queries';
import { benchWithRoom, createBench, type TestBench } from '../test-utils/fixtures';
import { addOpening, deleteOpening, updateOpening } from './openings';
import { createRectangularRoom, moveRoom, setRoomSideLength } from './rooms';
import { setWallHeight } from './walls';

const T = 150;
const door = { width: 800, height: 2000 };
const window_ = { width: 1200, height: 1100, sill: 900 };

const level = (bench: TestBench) => requireLevel(bench.project, bench.levelId);

const expectCode = (fn: () => unknown, code: DomainError['code'], reason?: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    if (reason) expect((e as DomainError).params.reason).toBe(reason);
    return;
  }
  throw new Error(`Se esperaba DomainError(${code})`);
};

/** Muro sur (lado 1) del recinto de 4 × 3 m del banco de pruebas. */
function southWall(bench: TestBench & { roomId: string }) {
  const lvl = level(bench);
  const room = lvl.rooms.find((r) => r.id === bench.roomId)!;
  return roomSides(lvl, room)[0]!.wallIds[0]!;
}

describe('vanos', () => {
  it('se insertan centrados en el tramo útil del muro', () => {
    const bench = benchWithRoom();
    const wallId = southWall(bench);
    const { openingId } = bench.run(addOpening, {
      levelId: bench.levelId,
      wallId,
      def: 'door.single@1',
      params: door,
    });
    const opening = level(bench).openings.find((o) => o.id === openingId)!;
    // Eje de 4150 mm; el centro queda en la mitad.
    expect(opening.offset).toBe(2075);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('el tramo útil excluye las esquinas', () => {
    const bench = benchWithRoom();
    const range = openingOffsetRange(level(bench), southWall(bench), 1000)!;
    // Útil: lo que cubre la cara interior (más corta por el inglete), de 75 a 4075 en el eje.
    expect(range.start).toBeCloseTo(T / 2 + 500, 6);
    expect(range.end).toBeCloseTo(4000 + T / 2 - 500, 6);
    expect(openingOffsetRange(level(bench), southWall(bench), 5000)).toBeNull();
  });

  it('rechaza vanos que no caben, se superponen o superan la altura', () => {
    const bench = benchWithRoom();
    const ref = { levelId: bench.levelId, wallId: southWall(bench), def: 'window.fixed@1' };
    expectCode(
      () => bench.run(addOpening, { ...ref, params: { ...window_, width: 4500 } }),
      'opening-conflict',
      'wall',
    );
    expectCode(
      () => bench.run(addOpening, { ...ref, params: { ...window_, height: 1500 } }),
      'opening-conflict',
      'height',
    );
    bench.run(addOpening, { ...ref, params: window_, offset: 1500 });
    expectCode(
      () => bench.run(addOpening, { ...ref, params: window_, offset: 2200 }),
      'opening-conflict',
      'overlap',
    );
    expectCode(
      () => bench.run(addOpening, { ...ref, def: 'puerta', params: door }),
      'invalid-argument',
    );
  });

  it('sin posición, busca el lugar libre más cercano al centro', () => {
    const bench = benchWithRoom();
    const ref = { levelId: bench.levelId, wallId: southWall(bench), def: 'window.fixed@1' };
    bench.run(addOpening, { ...ref, params: window_ });
    bench.run(addOpening, { ...ref, params: window_ });
    const offsets = level(bench).openings.map((o) => o.offset);
    expect(offsets[0]).toBe(2075);
    expect(Math.abs(offsets[1]! - 2075)).toBe(1200 + 100);
    bench.run(addOpening, { ...ref, params: window_ });
    expectCode(() => bench.run(addOpening, { ...ref, params: window_ }), 'opening-conflict');
  });

  it('se mueve, cambia y elimina', () => {
    const bench = benchWithRoom();
    const { openingId } = bench.run(addOpening, {
      levelId: bench.levelId,
      wallId: southWall(bench),
      def: 'door.single@1',
      params: door,
    });
    const ref = { levelId: bench.levelId, openingId };
    bench.run(updateOpening, { ...ref, offset: 1000, params: { width: 900, hinge: 'end' } });
    const opening = level(bench).openings[0]!;
    expect(opening).toMatchObject({
      offset: 1000,
      params: { width: 900, height: 2000, hinge: 'end' },
    });
    expect(openingSpan(opening)).toEqual({ start: 550, end: 1450 });
    expectCode(() => bench.run(updateOpening, { ...ref, offset: 100 }), 'opening-conflict');
    bench.run(updateOpening, { ...ref, def: 'door.sliding@1' });
    expect(level(bench).openings[0]!.def).toBe('door.sliding@1');
    expectCode(() => bench.run(updateOpening, { ...ref, def: 'corredera' }), 'invalid-argument');
    bench.run(deleteOpening, ref);
    expect(level(bench).openings).toHaveLength(0);
    expectCode(() => bench.run(deleteOpening, ref), 'not-found');
  });

  it('las distancias libres se miden en la cara interior del recinto', () => {
    const bench = benchWithRoom();
    const wallId = southWall(bench);
    bench.run(addOpening, {
      levelId: bench.levelId,
      wallId,
      def: 'window.fixed@1',
      params: window_,
      offset: 1000,
    });
    const lvl = level(bench);
    const face = wallFaceTowardRoom(lvl, lvl.rooms[0]!, wallId)!;
    const gaps = openingGaps(lvl, lvl.openings[0]!, face)!;
    // Cara interior de x = 0 a x = 4000 (eje desde −75): borde izquierdo del vano en 325.
    expect(gaps.start).toBeCloseTo(1000 - 600 - T / 2, 6);
    expect(gaps.end).toBeCloseTo(4000 + T / 2 - 1600, 6);
    // Y a la inversa: dejar 50 cm hasta el extremo final de la cara.
    const offset = openingOffsetForGap(lvl, lvl.openings[0]!, face, 'end', 500)!;
    expect(offset).toBeCloseTo(4000 + T / 2 - 500 - 600, 6);
  });

  it('bajar el muro o achicar el recinto no puede dejar un vano fuera', () => {
    const bench = benchWithRoom();
    bench.run(addOpening, {
      levelId: bench.levelId,
      wallId: southWall(bench),
      def: 'window.fixed@1',
      params: { ...window_, width: 3000 },
    });
    expectCode(
      () =>
        bench.run(setRoomSideLength, {
          levelId: bench.levelId,
          roomId: bench.roomId,
          sideIndex: 0,
          length: 2500,
        }),
      'opening-conflict',
    );
    expectCode(
      () =>
        bench.run(setWallHeight, {
          levelId: bench.levelId,
          wallId: southWall(bench),
          height: 1900,
        }),
      'opening-conflict',
    );
  });

  it('una puerta en un tabique compartido queda con el vecino al separar los recintos', () => {
    const bench = createBench();
    const add = (name: string, x: number, width: number) =>
      bench.run(createRectangularRoom, {
        levelId: bench.levelId,
        name,
        origin: { x, y: 0 },
        width,
        depth: 3000,
        height: 2400,
        thickness: T,
      }).roomId;
    const a = add('A', 0, 4000);
    const b = add('B', 4000 + T, 3000);
    const shared = level(bench).walls.find((w) => roomsOfWall(level(bench), w.id).length === 2)!;
    bench.run(addOpening, {
      levelId: bench.levelId,
      wallId: shared.id,
      def: 'door.single@1',
      params: door,
    });
    bench.run(moveRoom, { levelId: bench.levelId, roomId: b, dx: 1000, dy: 0 });
    const lvl = level(bench);
    expect(lvl.openings).toHaveLength(1);
    expect(roomsOfWall(lvl, lvl.openings[0]!.wallId).map((r) => r.id)).toEqual([a]);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('el vano conserva su posición cuando un vecino divide el muro', () => {
    const bench = benchWithRoom();
    const wallId = southWall(bench);
    bench.run(addOpening, {
      levelId: bench.levelId,
      wallId,
      def: 'window.fixed@1',
      params: window_,
      offset: 3000,
    });
    // Un recinto al sur, adosado solo a la primera mitad del muro: lo divide en x = 2075.
    bench.run(createRectangularRoom, {
      levelId: bench.levelId,
      name: 'S',
      origin: { x: 0, y: -2000 - T },
      width: 2000,
      depth: 2000,
      height: 2400,
      thickness: T,
    });
    const lvl = level(bench);
    const opening = lvl.openings[0]!;
    expect(opening.wallId).not.toBe(wallId);
    const nodes = new Map(lvl.nodes.map((n) => [n.id, n]));
    const wall = lvl.walls.find((w) => w.id === opening.wallId)!;
    const start = nodes.get(wall.start)!;
    const end = nodes.get(wall.end)!;
    const dir = Math.sign(end.x - start.x);
    // Centro del vano en planta: sigue en x = −75 + 3000.
    expect(start.x + dir * opening.offset).toBe(-75 + 3000);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });
});
