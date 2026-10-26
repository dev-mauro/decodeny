import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors';
import { polygonArea } from '../geometry';
import { checkIntegrity } from '../model/integrity';
import {
  levelBounds,
  requireLevel,
  requireRoom,
  roomSideLengths,
  roomInteriorPolygon,
  roomMetrics,
  roomsOfWall,
  suggestRoomOrigin,
} from '../model/queries';
import { benchWithRoom, createBench } from '../test-utils/fixtures';
import { renameProject } from './project';
import {
  createRectangularRoom,
  createRoomFromPath,
  deleteRoom,
  moveRoom,
  renameRoom,
  setRoomSideLength,
  setRoomWallHeight,
} from './rooms';
import { setWallHeight, setWallThickness } from './walls';

const level = (bench: { project: Parameters<typeof requireLevel>[0]; levelId: string }) =>
  requireLevel(bench.project, bench.levelId);

const expectCode = (fn: () => unknown, code: DomainError['code']) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Se esperaba DomainError(${code})`);
};

describe('createRectangularRoom', () => {
  it('crea 4 nodos, 4 muros y un recinto con medidas interiores exactas', () => {
    const bench = benchWithRoom();
    const lvl = level(bench);
    expect(lvl.nodes).toHaveLength(4);
    expect(lvl.walls).toHaveLength(4);
    expect(lvl.rooms).toHaveLength(1);
    const room = requireRoom(lvl, bench.roomId);
    expect(roomSideLengths(lvl, room).map(Math.round)).toEqual([4000, 3000, 4000, 3000]);
    const metrics = roomMetrics(lvl, room);
    expect(metrics.area).toBeCloseTo(12_000_000, 3);
    expect(metrics.perimeter).toBeCloseTo(14_000, 3);
    expect(metrics.interiorBounds.min.x).toBeCloseTo(0, 6);
    // El eje de los muros queda a medio espesor por fuera.
    expect(lvl.nodes[0]).toMatchObject({ x: -75, y: -75 });
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('rechaza medidas fuera de rango sin modificar el documento', () => {
    const bench = createBench();
    const before = bench.project;
    const base = {
      levelId: bench.levelId,
      name: 'X',
      origin: { x: 0, y: 0 },
      width: 4000,
      depth: 3000,
      height: 2400,
      thickness: 150,
    };
    expectCode(() => bench.run(createRectangularRoom, { ...base, width: 30 }), 'out-of-range');
    expectCode(() => bench.run(createRectangularRoom, { ...base, height: 50 }), 'out-of-range');
    expectCode(() => bench.run(createRectangularRoom, { ...base, thickness: 5 }), 'out-of-range');
    expectCode(() => bench.run(createRectangularRoom, { ...base, levelId: 'nope' }), 'not-found');
    expect(bench.project).toBe(before);
  });

  it('propiedad: cualquier rectángulo válido produce un documento íntegro con su área', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 300, max: 30_000 }),
        fc.integer({ min: 300, max: 30_000 }),
        fc.integer({ min: 20, max: 1000 }),
        fc.integer({ min: -50_000, max: 50_000 }),
        (width, depth, thickness, x) => {
          const bench = createBench();
          const { roomId } = bench.run(createRectangularRoom, {
            levelId: bench.levelId,
            name: 'R',
            origin: { x, y: 0 },
            width,
            depth,
            height: 2400,
            thickness: thickness % 2 === 0 ? thickness : thickness + 1,
          });
          const lvl = level(bench);
          expect(checkIntegrity(bench.project)).toEqual([]);
          expect(roomMetrics(lvl, requireRoom(lvl, roomId)).area).toBeCloseTo(width * depth, 0);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('createRoomFromPath', () => {
  const lShape = [
    { length: 6000, turn: 90 },
    { length: 2000, turn: 90 },
    { length: 3000, turn: -90 },
    { length: 2000, turn: 90 },
    { length: 3000, turn: 90 },
    { length: 4000, turn: 90 },
  ];

  it('crea un recinto en L a partir de tramos interiores', () => {
    const bench = createBench();
    const { roomId } = bench.run(createRoomFromPath, {
      levelId: bench.levelId,
      name: 'L',
      origin: { x: 0, y: 0 },
      segments: lShape,
      height: 2500,
      thickness: 100,
    });
    const lvl = level(bench);
    const room = requireRoom(lvl, roomId);
    expect(room.boundary).toHaveLength(6);
    expect(roomSideLengths(lvl, room).map(Math.round)).toEqual([
      6000, 2000, 3000, 2000, 3000, 4000,
    ]);
    expect(polygonArea(roomInteriorPolygon(lvl, room))).toBeCloseTo(6000 * 4000 - 3000 * 2000, 0);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('acepta recorridos horarios normalizándolos', () => {
    const bench = createBench();
    const clockwise = [
      { length: 3000, turn: -90 },
      { length: 3000, turn: -90 },
      { length: 3000, turn: -90 },
      { length: 3000, turn: -90 },
    ];
    const { roomId } = bench.run(createRoomFromPath, {
      levelId: bench.levelId,
      name: 'CW',
      origin: { x: 0, y: 0 },
      segments: clockwise,
      height: 2400,
      thickness: 150,
    });
    const lvl = level(bench);
    expect(roomMetrics(lvl, requireRoom(lvl, roomId)).area).toBeCloseTo(9_000_000, 0);
  });

  it('cierra automáticamente un recorrido abierto', () => {
    const bench = createBench();
    const { roomId } = bench.run(createRoomFromPath, {
      levelId: bench.levelId,
      name: 'Abierto',
      origin: { x: 0, y: 0 },
      segments: [
        { length: 4000, turn: 90 },
        { length: 3000, turn: 90 },
        { length: 4000, turn: 0 },
      ],
      height: 2400,
      thickness: 150,
    });
    expect(requireRoom(level(bench), roomId).boundary).toHaveLength(4);
  });

  it('rechaza recorridos que se cruzan o con muy pocos lados', () => {
    const bench = createBench();
    const base = {
      levelId: bench.levelId,
      name: 'X',
      origin: { x: 0, y: 0 },
      height: 2400,
      thickness: 150,
    };
    expectCode(
      () => bench.run(createRoomFromPath, { ...base, segments: [{ length: 3000, turn: 180 }] }),
      'invalid-geometry',
    );
    const bowtie = [
      { length: 4000, turn: 135 },
      { length: 5657, turn: -135 },
      { length: 4000, turn: 135 },
    ];
    expectCode(
      () => bench.run(createRoomFromPath, { ...base, segments: bowtie }),
      'invalid-geometry',
    );
    expectCode(
      () => bench.run(createRoomFromPath, { ...base, segments: [{ length: 10, turn: 90 }] }),
      'out-of-range',
    );
  });
});

describe('edición de recintos', () => {
  it('renombra y mueve', () => {
    const bench = benchWithRoom();
    bench.run(renameRoom, { levelId: bench.levelId, roomId: bench.roomId, name: '  Comedor  ' });
    bench.run(moveRoom, { levelId: bench.levelId, roomId: bench.roomId, dx: 1000, dy: -500 });
    const lvl = level(bench);
    expect(requireRoom(lvl, bench.roomId).name).toBe('Comedor');
    expect(levelBounds(lvl)!.min).toEqual({ x: 925, y: -575 });
  });

  it('cambia el largo interior de un lado manteniendo el rectángulo', () => {
    const bench = benchWithRoom();
    bench.run(setRoomSideLength, {
      levelId: bench.levelId,
      roomId: bench.roomId,
      sideIndex: 0,
      length: 5200,
    });
    const lvl = level(bench);
    expect(roomSideLengths(lvl, requireRoom(lvl, bench.roomId)).map(Math.round)).toEqual([
      5200, 3000, 5200, 3000,
    ]);
  });

  it('el lado siguiente al último es el primero', () => {
    const bench = benchWithRoom();
    bench.run(setRoomSideLength, {
      levelId: bench.levelId,
      roomId: bench.roomId,
      sideIndex: 3,
      length: 2500,
    });
    const lvl = level(bench);
    expect(roomSideLengths(lvl, requireRoom(lvl, bench.roomId)).map(Math.round)).toEqual([
      4000, 2500, 4000, 2500,
    ]);
  });

  it('no cambia nada si el largo es el mismo', () => {
    const bench = benchWithRoom();
    const before = bench.project;
    bench.run(setRoomSideLength, {
      levelId: bench.levelId,
      roomId: bench.roomId,
      sideIndex: 1,
      length: 3000,
    });
    expect(bench.project).toBe(before);
  });

  it('valida índice y largo', () => {
    const bench = benchWithRoom();
    const ref = { levelId: bench.levelId, roomId: bench.roomId };
    expectCode(
      () => bench.run(setRoomSideLength, { ...ref, sideIndex: 9, length: 3000 }),
      'invalid-argument',
    );
    expectCode(
      () => bench.run(setRoomSideLength, { ...ref, sideIndex: 0, length: 0 }),
      'out-of-range',
    );
  });

  it('admite tramos cortos, como un muro de 20 cm en un nicho', () => {
    const bench = createBench();
    const { roomId } = bench.run(createRoomFromPath, {
      levelId: bench.levelId,
      name: 'Nicho',
      origin: { x: 0, y: 0 },
      segments: [
        { length: 3000, turn: 90 },
        { length: 200, turn: 90 },
        { length: 600, turn: -90 },
        { length: 2800, turn: 90 },
        { length: 2400, turn: 90 },
        { length: 3000, turn: 90 },
      ],
      height: 2400,
      thickness: 100,
    });
    const lvl = level(bench);
    expect(roomSideLengths(lvl, requireRoom(lvl, roomId)).map(Math.round)).toContain(200);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('rechaza cambios que hacen colapsar el recinto', () => {
    const bench = createBench();
    const { roomId } = bench.run(createRoomFromPath, {
      levelId: bench.levelId,
      name: 'L',
      origin: { x: 0, y: 0 },
      segments: [
        { length: 6000, turn: 90 },
        { length: 2000, turn: 90 },
        { length: 3000, turn: -90 },
        { length: 2000, turn: 90 },
        { length: 3000, turn: 90 },
        { length: 4000, turn: 90 },
      ],
      height: 2400,
      thickness: 100,
    });
    // Empujar el lado 1 deja al lado 3 con 20 mm interiores.
    expectCode(
      () =>
        bench.run(setRoomSideLength, {
          levelId: bench.levelId,
          roomId,
          sideIndex: 1,
          length: 3980,
        }),
      'too-short',
    );
  });

  it('cambia la altura de todos los muros del recinto', () => {
    const bench = benchWithRoom();
    bench.run(setRoomWallHeight, { levelId: bench.levelId, roomId: bench.roomId, height: 2700 });
    expect(level(bench).walls.every((w) => w.height === 2700)).toBe(true);
    expectCode(
      () =>
        bench.run(setRoomWallHeight, { levelId: bench.levelId, roomId: bench.roomId, height: 1 }),
      'out-of-range',
    );
  });

  it('elimina el recinto con sus muros y nodos', () => {
    const bench = benchWithRoom();
    bench.run(deleteRoom, { levelId: bench.levelId, roomId: bench.roomId });
    const lvl = level(bench);
    expect(lvl.rooms).toHaveLength(0);
    expect(lvl.walls).toHaveLength(0);
    expect(lvl.nodes).toHaveLength(0);
    expectCode(
      () => bench.run(deleteRoom, { levelId: bench.levelId, roomId: bench.roomId }),
      'not-found',
    );
  });

  it('al eliminar conserva los recintos restantes', () => {
    const bench = benchWithRoom();
    const lvl0 = level(bench);
    const { roomId: second } = bench.run(createRectangularRoom, {
      levelId: bench.levelId,
      name: 'Dormitorio',
      origin: suggestRoomOrigin(lvl0),
      width: 3000,
      depth: 3000,
      height: 2400,
      thickness: 150,
    });
    bench.run(deleteRoom, { levelId: bench.levelId, roomId: bench.roomId });
    const lvl = level(bench);
    expect(lvl.rooms.map((r) => r.id)).toEqual([second]);
    expect(lvl.walls).toHaveLength(4);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });
});

describe('edición de muros', () => {
  it('cambia altura y espesor', () => {
    const bench = benchWithRoom();
    const wall = level(bench).walls[0]!;
    bench.run(setWallHeight, { levelId: bench.levelId, wallId: wall.id, height: 3000 });
    bench.run(setWallThickness, { levelId: bench.levelId, wallId: wall.id, thickness: 250 });
    const updated = level(bench).walls[0]!;
    expect(updated).toMatchObject({ height: 3000, thickness: 250 });
    // El eje no se mueve: la cara interior avanza 50 mm.
    const lvl = level(bench);
    expect(roomSideLengths(lvl, requireRoom(lvl, bench.roomId)).map(Math.round)).toEqual([
      4000, 2950, 4000, 2950,
    ]);
    expect(roomsOfWall(lvl, wall.id).map((r) => r.id)).toEqual([bench.roomId]);
  });

  it('valida rangos y existencia', () => {
    const bench = benchWithRoom();
    const wallId = level(bench).walls[0]!.id;
    expectCode(
      () => bench.run(setWallHeight, { levelId: bench.levelId, wallId, height: 99_999 }),
      'out-of-range',
    );
    expectCode(
      () => bench.run(setWallThickness, { levelId: bench.levelId, wallId, thickness: 1 }),
      'out-of-range',
    );
    expectCode(
      () => bench.run(setWallHeight, { levelId: bench.levelId, wallId: 'x', height: 2000 }),
      'not-found',
    );
  });
});

describe('proyecto', () => {
  it('renombra y rechaza nombres vacíos', () => {
    const bench = createBench();
    bench.run(renameProject, { name: ' Depto Ñuñoa ' });
    expect(bench.project.meta.name).toBe('Depto Ñuñoa');
    expectCode(() => bench.run(renameProject, { name: '  ' }), 'invalid-argument');
  });

  it('sugiere el origen del primer recinto en (0,0)', () => {
    expect(suggestRoomOrigin(level(createBench()))).toEqual({ x: 0, y: 0 });
  });
});
