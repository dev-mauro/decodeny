import { describe, expect, it } from 'vitest';
import { createRectangularRoom, moveRoom } from '../commands';
import { benchWithRoom, createBench, type TestBench } from '../test-utils/fixtures';
import { requireLevel, roomsOfWall } from './queries';
import {
  ROOM_SNAP_DISTANCE,
  snapDrawPoint,
  snapNodePosition,
  snapRoomTranslation,
} from './snapping';

const T = 150;

function addRoom(bench: TestBench, x: number, y: number, width: number, depth: number) {
  return bench.run(createRectangularRoom, {
    levelId: bench.levelId,
    name: 'R',
    origin: { x, y },
    width,
    depth,
    height: 2400,
    thickness: T,
  }).roomId;
}

describe('snapRoomTranslation', () => {
  it('sin vecinos cerca, redondea a la grilla de 1 cm', () => {
    const bench = createBench();
    const a = addRoom(bench, 0, 0, 3000, 3000);
    const level = requireLevel(bench.project, bench.levelId);
    expect(snapRoomTranslation(level, a, { x: 1234.4, y: -987.6 })).toEqual({
      delta: { x: 1230, y: -990 },
      wallIds: [],
    });
  });

  it('alinea el eje con el muro vecino y la esquina con la suya', () => {
    const bench = createBench();
    addRoom(bench, 0, 0, 4000, 3000);
    const b = addRoom(bench, 6000, 500, 3000, 3000);
    const level = requireLevel(bench.project, bench.levelId);
    // Se acerca a 120 mm del tabique y a 80 mm de la esquina sur.
    const target = 4000 + T - 6000;
    const snap = snapRoomTranslation(level, b, { x: target + 120, y: -580 });
    expect(snap.delta).toEqual({ x: target, y: -500 });
    expect(snap.wallIds).toHaveLength(1);

    bench.run(moveRoom, { levelId: bench.levelId, roomId: b, dx: snap.delta.x, dy: snap.delta.y });
    const after = requireLevel(bench.project, bench.levelId);
    expect(after.walls.filter((w) => roomsOfWall(after, w.id).length > 1)).toHaveLength(1);
  });

  it('en el rincón entre dos recintos se alinea con ambos', () => {
    const bench = createBench();
    addRoom(bench, 0, 0, 4000, 3000);
    addRoom(bench, 0, 3000 + T, 2000, 2000);
    const c = addRoom(bench, 9000, 6000, 2000, 2000);
    const level = requireLevel(bench.project, bench.levelId);
    // Al norte de A y al este de B: comparte un muro con cada uno.
    const want = { x: 2000 + T - 9000, y: 3000 + T - 6000 };
    const snap = snapRoomTranslation(level, c, { x: want.x + 90, y: want.y - 60 });
    expect(snap.delta).toEqual(want);
    expect(snap.wallIds).toHaveLength(2);
  });

  it('se suelta más allá de la distancia de ajuste', () => {
    const bench = createBench();
    addRoom(bench, 0, 0, 4000, 3000);
    const b = addRoom(bench, 4000 + T, 0, 3000, 3000);
    const level = requireLevel(bench.project, bench.levelId);
    expect(snapRoomTranslation(level, b, { x: 100, y: 0 }).delta).toEqual({ x: 0, y: 0 });
    const away = snapRoomTranslation(level, b, { x: ROOM_SNAP_DISTANCE + 50, y: 0 });
    expect(away.delta.x).toBe(ROOM_SNAP_DISTANCE + 50);
  });
});

describe('snapDrawPoint', () => {
  const bench = benchWithRoom();
  const lvl = () => requireLevel(bench.project, bench.levelId);

  it('se pega a un nodo cercano', () => {
    const node = lvl().nodes[0]!;
    const snap = snapDrawPoint(lvl(), { x: node.x + 30, y: node.y - 20 }, null, 100);
    expect(snap).toEqual({ point: { x: node.x, y: node.y }, kind: 'node' });
  });

  it('se pega al eje de un muro cercano', () => {
    // Muro inferior: eje en y = -75.
    const snap = snapDrawPoint(lvl(), { x: 2003, y: -20 }, null, 100);
    expect(snap).toEqual({ point: { x: 2003, y: -75 }, kind: 'wall' });
  });

  it('bloquea la dirección a 45° y redondea el largo a 1 cm', () => {
    const snap = snapDrawPoint(
      lvl(),
      { x: 10_000 + 2004, y: 10_000 + 60 },
      { x: 10_000, y: 10_000 },
      50,
    );
    expect(snap).toEqual({ point: { x: 12_000, y: 10_000 }, kind: 'angle' });
  });

  it('con dirección bloqueada, termina donde esa dirección corta el muro', () => {
    // Desde abajo, subiendo casi vertical hacia el muro inferior.
    const snap = snapDrawPoint(lvl(), { x: 1010, y: -40 }, { x: 1000, y: -2000 }, 100);
    expect(snap).toEqual({ point: { x: 1000, y: -75 }, kind: 'wall' });
  });

  it('libre (Alt) solo redondea', () => {
    expect(snapDrawPoint(lvl(), { x: 2003.4, y: -20.6 }, null, 100, true)).toEqual({
      point: { x: 2003, y: -21 },
      kind: 'free',
    });
  });
});

describe('cuadrícula', () => {
  it('el dibujo, los nodos y los recintos se ajustan al paso de la cuadrícula', () => {
    const bench = benchWithRoom();
    const lvl = requireLevel(bench.project, bench.levelId);
    // Lejos de muros y nodos: punta a la grilla de 50 cm.
    expect(snapDrawPoint(lvl, { x: 9_740, y: 8_260 }, null, 50, false, 500)).toEqual({
      point: { x: 9_500, y: 8_500 },
      kind: 'grid',
    });
    // Con dirección bloqueada, el largo va de a 50 cm.
    expect(
      snapDrawPoint(lvl, { x: 12_740, y: 10_010 }, { x: 10_000, y: 10_000 }, 50, false, 500),
    ).toEqual({ point: { x: 12_500, y: 10_000 }, kind: 'angle' });
    const corner = lvl.nodes[0]!;
    expect(snapNodePosition(lvl, corner.id, { x: 5_180, y: 5_320 }, 150, 500)).toEqual({
      x: 5_000,
      y: 5_500,
    });
  });
});

describe('guías de alineación al dibujar', () => {
  it('un muro paralelo termina parejo con el extremo del muro cercano', () => {
    const bench = benchWithRoom();
    const lvl = requireLevel(bench.project, bench.levelId);
    // El recinto tiene esquinas de eje en x = -75 y x = 4075. Se dibuja una paralela más arriba,
    // y el puntero queda 6 cm antes del final.
    const snap = snapDrawPoint(lvl, { x: 4_015, y: 5_010 }, { x: -75, y: 5_000 }, 100);
    expect(snap.kind).toBe('angle');
    expect(snap.point).toEqual({ x: 4_075, y: 5_000 });
    expect(snap.guides?.some((g) => g.x === 4_075)).toBe(true);
  });

  it('sin dirección bloqueada alinea x e y por separado', () => {
    const bench = benchWithRoom();
    const lvl = requireLevel(bench.project, bench.levelId);
    const snap = snapDrawPoint(lvl, { x: 4_040, y: 6_330 }, null, 100);
    expect(snap.point).toEqual({ x: 4_075, y: 6_330 });
    expect(snap.guides).toHaveLength(1);
  });
});
