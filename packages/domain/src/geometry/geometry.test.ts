import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { intersectLines, segmentsIntersect } from './lines';
import {
  bounds,
  centroid,
  distanceToSegment,
  interiorPoint,
  isCounterClockwise,
  isSimplePolygon,
  offsetPolygon,
  perimeter,
  pointInPolygon,
  polygonArea,
  signedArea,
} from './polygon';
import { tracePath } from './turtle';
import { nearlyEqual, normalize, vec2, type Vec2 } from './vec2';
import { computeWallFootprints } from './wall-joints';

const square: Vec2[] = [vec2(0, 0), vec2(4000, 0), vec2(4000, 3000), vec2(0, 3000)];

const expectPoint = (actual: Vec2, expected: Vec2) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

describe('vectores y rectas', () => {
  it('normaliza el vector nulo sin producir NaN', () => {
    expect(normalize(vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it('intersecta rectas y detecta paralelas', () => {
    expectPoint(intersectLines(vec2(0, 1), vec2(1, 0), vec2(2, 0), vec2(0, 1))!, vec2(2, 1));
    expect(intersectLines(vec2(0, 0), vec2(1, 0), vec2(0, 1), vec2(2, 0))).toBeNull();
  });

  it('detecta cruces y contactos de segmentos', () => {
    expect(segmentsIntersect(vec2(0, 0), vec2(2, 2), vec2(0, 2), vec2(2, 0))).toBe(true);
    expect(segmentsIntersect(vec2(0, 0), vec2(1, 0), vec2(2, 0), vec2(3, 0))).toBe(false);
    expect(segmentsIntersect(vec2(0, 0), vec2(2, 0), vec2(1, 0), vec2(3, 0))).toBe(true);
    expect(segmentsIntersect(vec2(0, 0), vec2(2, 0), vec2(2, 0), vec2(2, 2))).toBe(true);
  });
});

describe('polígonos', () => {
  it('calcula área, orientación, perímetro, centroide y límites', () => {
    expect(signedArea(square)).toBe(12_000_000);
    expect(isCounterClockwise(square)).toBe(true);
    expect(isCounterClockwise([...square].reverse())).toBe(false);
    expect(polygonArea([...square].reverse())).toBe(12_000_000);
    expect(perimeter(square)).toBe(14_000);
    expectPoint(centroid(square), vec2(2000, 1500));
    expectPoint(centroid([vec2(0, 0), vec2(1, 0), vec2(2, 0)]), vec2(1, 0));
    expect(bounds(square)).toEqual({ min: vec2(0, 0), max: vec2(4000, 3000) });
  });

  it('desplaza aristas hacia adentro con espesores distintos', () => {
    const inner = offsetPolygon(square, [100, 200, 100, 200]);
    expectPoint(inner[0]!, vec2(200, 100));
    expectPoint(inner[2]!, vec2(3800, 2900));
  });

  it('mantiene vértices de aristas colineales al desplazar', () => {
    const withMidpoint = [
      vec2(0, 0),
      vec2(2000, 0),
      vec2(4000, 0),
      vec2(4000, 3000),
      vec2(0, 3000),
    ];
    const inner = offsetPolygon(withMidpoint, [100, 100, 100, 100, 100]);
    expectPoint(inner[1]!, vec2(2000, 100));
  });

  it('identifica polígonos simples', () => {
    expect(isSimplePolygon(square)).toBe(true);
    const bowtie = [vec2(0, 0), vec2(10, 10), vec2(10, 0), vec2(0, 10)];
    expect(isSimplePolygon(bowtie)).toBe(false);
    expect(isSimplePolygon([vec2(0, 0), vec2(1, 0)])).toBe(false);
    expect(isSimplePolygon([vec2(0, 0), vec2(0, 0), vec2(1, 1)])).toBe(false);
    expect(isSimplePolygon([vec2(0, 0), vec2(1, 0), vec2(2, 0)])).toBe(false);
  });

  it('ubica puntos dentro y fuera', () => {
    expect(pointInPolygon(vec2(10, 10), square)).toBe(true);
    expect(pointInPolygon(vec2(-10, 10), square)).toBe(false);
  });

  it('propiedad: desplazar un rectángulo hacia adentro reduce el área exactamente', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 20_000 }),
        fc.integer({ min: 1000, max: 20_000 }),
        fc.integer({ min: 10, max: 400 }),
        (w, h, t) => {
          const rect = [vec2(0, 0), vec2(w, 0), vec2(w, h), vec2(0, h)];
          const inner = offsetPolygon(rect, [t, t, t, t]);
          expect(polygonArea(inner)).toBeCloseTo((w - 2 * t) * (h - 2 * t), 3);
        },
      ),
    );
  });
});

describe('puntos interiores', () => {
  it('mide distancias a segmentos (incluye extremos y segmentos nulos)', () => {
    expect(distanceToSegment(vec2(5, 3), vec2(0, 0), vec2(10, 0))).toBe(3);
    expect(distanceToSegment(vec2(-3, 4), vec2(0, 0), vec2(10, 0))).toBe(5);
    expect(distanceToSegment(vec2(3, 4), vec2(0, 0), vec2(0, 0))).toBe(5);
  });

  it('usa el centroide en polígonos convexos', () => {
    expectPoint(interiorPoint(square), vec2(2000, 1500));
  });

  it('encuentra un punto dentro de una L aunque el centroide quede afuera', () => {
    // L delgada: el centroide cae en la esquina vacía.
    const l = [
      vec2(0, 0),
      vec2(6000, 0),
      vec2(6000, 1000),
      vec2(1000, 1000),
      vec2(1000, 6000),
      vec2(0, 6000),
    ];
    expect(pointInPolygon(centroid(l), l)).toBe(false);
    const p = interiorPoint(l);
    expect(pointInPolygon(p, l)).toBe(true);
  });
});

describe('tracePath (tortuga)', () => {
  it('cierra un rectángulo y descarta el punto repetido', () => {
    const path = tracePath([
      { length: 4000, turn: 90 },
      { length: 3000, turn: 90 },
      { length: 4000, turn: 90 },
      { length: 3000, turn: 90 },
    ]);
    expect(path.closed).toBe(true);
    expect(path.closingGap).toBe(0);
    expect(path.points).toHaveLength(4);
    path.points.forEach((p, i) => expectPoint(p, square[i]!));
  });

  it('informa la brecha si no cierra', () => {
    const path = tracePath([
      { length: 4000, turn: 90 },
      { length: 3000, turn: 90 },
      { length: 4000, turn: 0 },
    ]);
    expect(path.closed).toBe(false);
    expect(path.closingGap).toBeCloseTo(3000, 6);
    expect(path.points).toHaveLength(4);
  });

  it('respeta el origen y el rumbo inicial', () => {
    const path = tracePath([{ length: 1000, turn: 0 }], vec2(500, 500), 90);
    expectPoint(path.points[1]!, vec2(500, 1500));
  });

  it('un recorrido vacío no está cerrado', () => {
    expect(tracePath([]).closed).toBe(false);
  });
});

describe('computeWallFootprints', () => {
  const rectNodes = new Map(square.map((p, i) => [`n${i}`, p]));
  const rectWalls = [0, 1, 2, 3].map((i) => ({
    id: `w${i}`,
    start: `n${i}`,
    end: `n${(i + 1) % 4}`,
    thickness: 200,
  }));

  it('resuelve esquinas de un recinto rectangular con ingletes', () => {
    const fp = computeWallFootprints(rectNodes, rectWalls);
    const bottom = fp.get('w0')!;
    // Recinto antihorario: la izquierda del muro es el interior.
    expectPoint(bottom.startShape.left, vec2(100, 100));
    expectPoint(bottom.startShape.right, vec2(-100, -100));
    expectPoint(bottom.endShape.left, vec2(3900, 100));
    expectPoint(bottom.endShape.right, vec2(4100, -100));
    expect(bottom.startShape.capped).toBe(false);
    expect(bottom.polygon).toHaveLength(4);
    expect(isCounterClockwise(bottom.polygon)).toBe(true);
    // Muros vecinos comparten exactamente la esquina.
    expect(nearlyEqual(fp.get('w1')!.startShape.left, bottom.endShape.left)).toBe(true);
  });

  it('tapa los extremos libres', () => {
    const fp = computeWallFootprints(
      new Map([
        ['a', vec2(0, 0)],
        ['b', vec2(1000, 0)],
      ]),
      [{ id: 'w', start: 'a', end: 'b', thickness: 100 }],
    );
    const wall = fp.get('w')!;
    expect(wall.startShape.capped).toBe(true);
    expectPoint(wall.startShape.left, vec2(0, 50));
    expectPoint(wall.endShape.right, vec2(1000, -50));
  });

  it('continúa muros colineales sin tapa', () => {
    const nodes = new Map([
      ['a', vec2(0, 0)],
      ['b', vec2(1000, 0)],
      ['c', vec2(2000, 0)],
    ]);
    const fp = computeWallFootprints(nodes, [
      { id: 'w1', start: 'a', end: 'b', thickness: 100 },
      { id: 'w2', start: 'b', end: 'c', thickness: 100 },
    ]);
    expect(fp.get('w1')!.endShape.capped).toBe(false);
    expectPoint(fp.get('w1')!.endShape.left, vec2(1000, 50));
  });

  it('agrega el centro del nodo en uniones en T', () => {
    const nodes = new Map([
      ['a', vec2(0, 0)],
      ['b', vec2(1000, 0)],
      ['c', vec2(2000, 0)],
      ['d', vec2(1000, 1000)],
    ]);
    const fp = computeWallFootprints(nodes, [
      { id: 'w1', start: 'a', end: 'b', thickness: 100 },
      { id: 'w2', start: 'b', end: 'c', thickness: 100 },
      { id: 'w3', start: 'b', end: 'd', thickness: 100 },
    ]);
    const stem = fp.get('w3')!;
    expect(stem.startShape.center).toEqual(vec2(1000, 0));
    expectPoint(stem.startShape.left, vec2(950, 50));
    expectPoint(stem.startShape.right, vec2(1050, 50));
    expect(stem.polygon).toHaveLength(5);
  });

  it('corta ingletes demasiado agudos y los tapa', () => {
    const nodes = new Map([
      ['a', vec2(0, 0)],
      ['b', vec2(1000, 0)],
      ['c', vec2(0, 20)],
    ]);
    const fp = computeWallFootprints(nodes, [
      { id: 'w1', start: 'a', end: 'b', thickness: 100 },
      { id: 'w2', start: 'b', end: 'c', thickness: 100 },
    ]);
    expect(fp.get('w1')!.endShape.capped).toBe(true);
  });

  it('ignora muros degenerados o con nodos inexistentes', () => {
    const fp = computeWallFootprints(
      new Map([
        ['a', vec2(0, 0)],
        ['b', vec2(0, 0)],
      ]),
      [
        { id: 'w1', start: 'a', end: 'b', thickness: 100 },
        { id: 'w2', start: 'a', end: 'zz', thickness: 100 },
        { id: 'w3', start: 'a', end: 'a', thickness: 100 },
      ],
    );
    expect(fp.size).toBe(0);
  });

  it('propiedad: en polígonos rectangulares cada esquina interior queda a semiespesor de ambos ejes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 15_000 }),
        fc.integer({ min: 1000, max: 15_000 }),
        fc.integer({ min: 50, max: 300 }),
        (w, h, t) => {
          const pts = [vec2(0, 0), vec2(w, 0), vec2(w, h), vec2(0, h)];
          const nodes = new Map(pts.map((p, i) => [`n${i}`, p]));
          const walls = [0, 1, 2, 3].map((i) => ({
            id: `w${i}`,
            start: `n${i}`,
            end: `n${(i + 1) % 4}`,
            thickness: t,
          }));
          const fp = computeWallFootprints(nodes, walls);
          expectPoint(fp.get('w0')!.startShape.left, vec2(t / 2, t / 2));
          expectPoint(fp.get('w2')!.startShape.left, vec2(w - t / 2, h - t / 2));
        },
      ),
    );
  });
});
