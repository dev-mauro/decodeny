import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../history/history';
import { checkIntegrity } from '../model/integrity';
import { requireLevel, requireRoom, roomMetrics, roomsOfWall } from '../model/queries';
import { findWallCycles } from '../model/room-detection';
import { benchWithRoom, createBench, type TestBench } from '../test-utils/fixtures';
import { createRectangularRoom } from './rooms';
import { addWall, deleteWall, detectRooms } from './walls';

const level = (bench: TestBench) => requireLevel(bench.project, bench.levelId);

function draw(bench: TestBench, points: readonly [number, number][], roomName = 'Recinto') {
  const roomIds: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[i + 1]!;
    const out = bench.run(addWall, {
      levelId: bench.levelId,
      from: { x: x1, y: y1 },
      to: { x: x2, y: y2 },
      roomName,
    });
    roomIds.push(...out.roomIds);
  }
  return roomIds;
}

const square: [number, number][] = [
  [0, 0],
  [4000, 0],
  [4000, 3000],
  [0, 3000],
  [0, 0],
];

describe('muros sueltos', () => {
  it('un muro suelto no crea recintos y usa los valores del proyecto', () => {
    const bench = createBench();
    const ids = draw(bench, [
      [0, 0],
      [2000, 0],
    ]);
    expect(ids).toEqual([]);
    const lvl = level(bench);
    expect(lvl.walls).toHaveLength(1);
    expect(lvl.walls[0]!.thickness).toBe(bench.project.settings.defaultWallThickness);
    expect(lvl.rooms).toHaveLength(0);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('acepta muros cortos (20 cm) y rechaza los de largo casi nulo', () => {
    const bench = createBench();
    draw(bench, [
      [0, 0],
      [200, 0],
    ]);
    expect(level(bench).walls).toHaveLength(1);
    expect(() =>
      executeCommand(
        bench.project,
        addWall,
        { levelId: bench.levelId, from: { x: 0, y: 0 }, to: { x: 5, y: 0 } },
        { ids: bench.ids },
      ),
    ).toThrow(/length/);
  });

  it('al cerrar un contorno se crea el recinto', () => {
    const bench = createBench();
    const ids = draw(bench, square);
    expect(ids).toHaveLength(1);
    const lvl = level(bench);
    const room = requireRoom(lvl, ids[0]!);
    expect(room.name).toBe('Recinto 1');
    // Los tramos colineales se unen: 4 muros, 4 nodos.
    expect(lvl.walls).toHaveLength(4);
    expect(lvl.nodes).toHaveLength(4);
    const t = bench.project.settings.defaultWallThickness;
    expect(roomMetrics(lvl, room).area).toBeCloseTo((4000 - t) * (3000 - t));
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('un extremo sobre un muro forma una unión en T', () => {
    const bench = createBench();
    draw(bench, [
      [0, 0],
      [4000, 0],
    ]);
    draw(bench, [
      [2000, 0],
      [2000, 2000],
    ]);
    const lvl = level(bench);
    expect(lvl.walls).toHaveLength(3);
    expect(lvl.nodes).toHaveLength(4);
  });

  it('dos muros que se cruzan se dividen en el cruce (X)', () => {
    const bench = createBench();
    draw(bench, [
      [0, 0],
      [4000, 0],
    ]);
    draw(bench, [
      [2000, -1000],
      [2000, 1000],
    ]);
    const lvl = level(bench);
    expect(lvl.walls).toHaveLength(4);
    const center = lvl.nodes.find((n) => n.x === 2000 && n.y === 0);
    expect(center).toBeDefined();
    expect(lvl.walls.filter((w) => w.start === center!.id || w.end === center!.id)).toHaveLength(4);
  });

  it('un tabique que cruza un recinto lo divide en dos, conservando el nombre', () => {
    const bench = benchWithRoom();
    // Muro de lado a lado por el eje x = 2000 (el recinto va de 0 a 4000 interior).
    const ids = draw(
      bench,
      [
        [2000, -75],
        [2000, 3075],
      ],
      'Recinto',
    );
    const lvl = level(bench);
    expect(lvl.rooms).toHaveLength(2);
    expect(ids).toHaveLength(2);
    const names = lvl.rooms.map((r) => r.name).sort();
    expect(names).toEqual(['Living', 'Recinto 1']);
    // El original conserva su id.
    expect(lvl.rooms.some((r) => r.id === bench.roomId)).toBe(true);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('un muro suelto dentro de un recinto no lo divide', () => {
    const bench = benchWithRoom();
    draw(bench, [
      [1000, 1000],
      [2000, 1000],
    ]);
    const lvl = level(bench);
    expect(lvl.rooms).toHaveLength(1);
    expect(lvl.walls).toHaveLength(5);
  });

  it('detectar recintos crea los que faltan sin duplicar los existentes', () => {
    const bench = createBench();
    for (let i = 0; i < square.length - 1; i++) {
      const [x1, y1] = square[i]!;
      const [x2, y2] = square[i + 1]!;
      bench.run(addWall, { levelId: bench.levelId, from: { x: x1, y: y1 }, to: { x: x2, y: y2 } });
    }
    expect(level(bench).rooms).toHaveLength(0);
    expect(findWallCycles(level(bench))).toHaveLength(1);
    expect(bench.run(detectRooms, { levelId: bench.levelId, roomName: 'R' }).roomIds).toHaveLength(
      1,
    );
    expect(bench.run(detectRooms, { levelId: bench.levelId, roomName: 'R' }).roomIds).toEqual([]);
    expect(level(bench).rooms).toHaveLength(1);
  });
});

describe('borrar muros', () => {
  it('borrar un muro suelto lo quita junto con sus nodos', () => {
    const bench = createBench();
    draw(bench, [
      [0, 0],
      [2000, 0],
    ]);
    const wallId = level(bench).walls[0]!.id;
    bench.run(deleteWall, { levelId: bench.levelId, wallId, roomName: 'R' });
    expect(level(bench).walls).toHaveLength(0);
    expect(level(bench).nodes).toHaveLength(0);
  });

  it('borrar un muro exterior abre el recinto: se quita el recinto, quedan sus muros', () => {
    const bench = benchWithRoom();
    const wallId = level(bench).walls[0]!.id;
    bench.run(deleteWall, { levelId: bench.levelId, wallId, roomName: 'R' });
    const lvl = level(bench);
    expect(lvl.rooms).toHaveLength(0);
    expect(lvl.walls).toHaveLength(3);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('borrar el tabique que separa dos recintos los une con el nombre del más grande', () => {
    const bench = benchWithRoom();
    draw(bench, [
      [1000, -75],
      [1000, 3075],
    ]);
    const lvl0 = level(bench);
    expect(lvl0.rooms).toHaveLength(2);
    const divider = lvl0.walls.find((w) => roomsOfWall(lvl0, w.id).length === 2)!;
    bench.run(deleteWall, { levelId: bench.levelId, wallId: divider.id, roomName: 'R' });
    const lvl = level(bench);
    expect(lvl.rooms).toHaveLength(1);
    expect(lvl.rooms[0]!.name).toBe('Living');
    expect(lvl.rooms[0]!.id).toBe(bench.roomId);
    expect(lvl.walls).toHaveLength(4);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });
});

describe('detección de recintos (propiedades)', () => {
  it('k tabiques de lado a lado dividen un rectángulo en k + 1 recintos que lo cubren', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 11 }), { maxLength: 5 }),
        fc.boolean(),
        (slots, partitionsFirst) => {
          const bench = createBench();
          const t = bench.project.settings.defaultWallThickness;
          const xs = slots.map((k) => k * 500);
          const partitions = () =>
            xs.forEach((x) =>
              draw(bench, [
                [x, 0],
                [x, 3000],
              ]),
            );
          // El orden no importa: tabiques antes (sueltos) o después del contorno.
          if (partitionsFirst) partitions();
          draw(bench, [
            [0, 0],
            [6000, 0],
            [6000, 3000],
            [0, 3000],
            [0, 0],
          ]);
          if (!partitionsFirst) partitions();

          const lvl = level(bench);
          expect(lvl.rooms).toHaveLength(xs.length + 1);
          const total = lvl.rooms.reduce((sum, r) => sum + roomMetrics(lvl, r).area, 0);
          expect(total).toBeCloseTo((6000 - t * (xs.length + 1)) * (3000 - t), -2);
          expect(checkIntegrity(bench.project)).toEqual([]);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('un tabique más cerca del muro que su espesor no crea un recinto invertido', () => {
    const bench = createBench();
    draw(bench, [
      [0, 0],
      [6000, 0],
      [6000, 3000],
      [0, 3000],
      [0, 0],
    ]);
    draw(bench, [
      [100, 0],
      [100, 3000],
    ]);
    const lvl = level(bench);
    expect(lvl.rooms).toHaveLength(1);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });
});

describe('muros que se tocan cara a cara', () => {
  const T = 150;
  function rooms(bench: TestBench, rects: readonly [number, number, number, number][]) {
    rects.forEach(([x, y, width, depth], i) =>
      bench.run(createRectangularRoom, {
        levelId: bench.levelId,
        name: `R${i}`,
        origin: { x, y },
        width,
        depth,
        height: 2400,
        thickness: T,
      }),
    );
  }

  it('un muro cierra un hueco limitado por muros dobles (sin eje común) y crea el recinto', () => {
    const bench = createBench();
    // A y B abajo; C arriba con su muro tocando cara a cara los de A y B (no los comparte).
    rooms(bench, [
      [0, 0, 2000, 3000],
      [4300, 0, 2000, 3000],
      [0, 3300, 6300, 2000],
    ]);
    const before = level(bench).walls.length;
    const { roomIds } = bench.run(addWall, {
      levelId: bench.levelId,
      from: { x: 2075, y: -75 },
      to: { x: 4225, y: -75 },
      roomName: 'Recinto',
    });
    expect(roomIds).toHaveLength(1);
    const lvl = level(bench);
    // Interior visible: entre las caras de A y B (2150 → 4150) y de y = 0 a la cara de C (3150).
    expect(roomMetrics(lvl, requireRoom(lvl, roomIds[0]!)).area).toBeCloseTo(2000 * 3150, -3);
    // Solo se agregan los puentes que cierran el recinto (uno a cada lado), no uno por esquina.
    expect(lvl.walls.length).toBeLessThanOrEqual(before + 1 + 2 + 4);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('los muros dobles sin hueco cerrado no reciben puentes', () => {
    const bench = createBench();
    rooms(bench, [
      [0, 0, 2000, 3000],
      [2300, 0, 2000, 3000],
    ]);
    const walls = level(bench).walls.length;
    expect(bench.run(detectRooms, { levelId: bench.levelId, roomName: 'R' }).roomIds).toEqual([]);
    expect(level(bench).walls).toHaveLength(walls);
  });
});
