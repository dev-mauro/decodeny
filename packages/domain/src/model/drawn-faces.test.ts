import { describe, expect, it } from 'vitest';
import { addWall, createRectangularRoom } from '../commands';
import { createBench, type TestBench } from '../test-utils/fixtures';
import type { Vec2 } from '../geometry';
import { requireLevel, roomMetrics } from './queries';

const T = 150;

/** Dibuja con el lápiz: un `addWall` por tramo, con la cadena hasta ese punto. */
function draw(bench: TestBench, points: readonly Vec2[]) {
  let roomIds: readonly string[] = [];
  for (let i = 1; i < points.length; i++) {
    const out = bench.run(addWall, {
      levelId: bench.levelId,
      from: points[i - 1]!,
      to: points[i]!,
      thickness: T,
      roomName: 'Espacio',
      chain: points.slice(0, i + 1),
    });
    roomIds = out.roomIds;
  }
  return roomIds;
}

const level = (bench: TestBench) => requireLevel(bench.project, bench.levelId);
const room = (bench: TestBench, id: string) => level(bench).rooms.find((r) => r.id === id)!;
const size = (bench: TestBench, id: string) => {
  const { interiorBounds: b } = roomMetrics(level(bench), room(bench, id));
  return { width: Math.round(b.max.x - b.min.x), depth: Math.round(b.max.y - b.min.y), b };
};

describe('dibujo por la cara interior', () => {
  it('2 m, giro, 1 m, giro, 2 m, giro, 1 m: deja 2 × 1 m libres entre muro y muro', () => {
    const bench = createBench();
    const [id] = draw(bench, [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 1000 },
      { x: 0, y: 1000 },
      { x: 0, y: 0 },
    ]);
    const s = size(bench, id!);
    expect(s).toMatchObject({ width: 2000, depth: 1000 });
    // La línea dibujada es la cara interior: el interior arranca donde se empezó a dibujar.
    expect(s.b.min).toEqual({ x: 0, y: 0 });
    expect(roomMetrics(level(bench), room(bench, id!)).area).toBeCloseTo(2_000_000);
  });

  it('da lo mismo dibujarlo en sentido horario', () => {
    const bench = createBench();
    const [id] = draw(bench, [
      { x: 0, y: 0 },
      { x: 0, y: 1000 },
      { x: 2000, y: 1000 },
      { x: 2000, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(size(bench, id!)).toMatchObject({ width: 2000, depth: 1000 });
  });

  it('en L (con una esquina hacia adentro), el interior es exactamente lo dibujado', () => {
    const bench = createBench();
    const [id] = draw(bench, [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 2000 },
      { x: 0, y: 2000 },
      { x: 0, y: 0 },
    ]);
    expect(size(bench, id!)).toMatchObject({ width: 3000, depth: 2000 });
    expect(roomMetrics(level(bench), room(bench, id!)).area).toBeCloseTo(4_000_000);
  });

  it('con ángulos que no son rectos (triángulo), el área es la del dibujo', () => {
    const bench = createBench();
    const [id] = draw(bench, [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 0, y: 3000 },
      { x: 0, y: 0 },
    ]);
    // Redondeo a mm de las esquinas: tolerancia de unos cm².
    expect(roomMetrics(level(bench), room(bench, id!)).area / 1e6).toBeCloseTo(6, 2);
  });

  it('un espacio adosado se mide desde la cara del muro existente y no mueve al vecino', () => {
    const bench = createBench();
    const { roomId: first } = bench.run(createRectangularRoom, {
      levelId: bench.levelId,
      name: 'Living',
      origin: { x: 0, y: 0 },
      width: 3000,
      depth: 3000,
      height: 2400,
      thickness: T,
    });
    const before = size(bench, first);
    // Eje del muro este del living: x = 3000 + 75. Se dibuja un U de 2 × 1 m pegado a él.
    const east = 3000 + T / 2;
    const ids = draw(bench, [
      { x: east, y: 500 },
      { x: east + 2000, y: 500 },
      { x: east + 2000, y: 1500 },
      { x: east, y: 1500 },
    ]);
    const added = ids.find((id) => id !== first)!;
    const s = size(bench, added);
    expect(s).toMatchObject({ width: 2000, depth: 1000 });
    // Empieza en la cara del living (x = 3150) y el living queda igual.
    expect(s.b.min.x).toBe(3000 + T);
    expect(size(bench, first)).toEqual(before);
  });

  it('un tabique que divide un espacio queda donde se dibujó', () => {
    const bench = createBench();
    bench.run(createRectangularRoom, {
      levelId: bench.levelId,
      name: 'Living',
      origin: { x: 0, y: 0 },
      width: 4000,
      depth: 3000,
      height: 2400,
      thickness: T,
    });
    draw(bench, [
      { x: 2000, y: -T / 2 },
      { x: 2000, y: 3000 + T / 2 },
    ]);
    const xs = level(bench)
      .nodes.filter((n) => n.y > 0 && n.y < 3000)
      .map((n) => n.x);
    expect(level(bench).rooms).toHaveLength(2);
    expect(level(bench).nodes.some((n) => n.x === 2000 && n.y === -T / 2)).toBe(true);
    expect(xs.every((x) => x !== 2000 + T / 2 && x !== 2000 - T / 2)).toBe(true);
  });

  it('sin cadena (otras herramientas), el muro se ubica por su eje como siempre', () => {
    const bench = createBench();
    const points = [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 1000 },
      { x: 0, y: 1000 },
      { x: 0, y: 0 },
    ];
    let id = '';
    for (let i = 1; i < points.length; i++) {
      const out = bench.run(addWall, {
        levelId: bench.levelId,
        from: points[i - 1]!,
        to: points[i]!,
        thickness: T,
        roomName: 'Espacio',
      });
      id = out.roomIds[0] ?? id;
    }
    expect(size(bench, id)).toMatchObject({ width: 2000 - T, depth: 1000 - T });
  });
});
