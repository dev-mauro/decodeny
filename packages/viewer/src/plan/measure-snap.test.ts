import { describe, expect, it } from 'vitest';
import { snapMeasurePoint } from './measure-snap';

// Recinto interior de 4000 × 3000 y una mesa de 1000 × 600 centrada en (2000, 1500).
const room = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 },
];
const table = [
  { x: 1500, y: 1200 },
  { x: 2500, y: 1200 },
  { x: 2500, y: 1800 },
  { x: 1500, y: 1800 },
];
const outlines = [room, table];

describe('ajuste de la medición en planta', () => {
  it('se engancha a esquinas antes que a bordes', () => {
    expect(snapMeasurePoint(outlines, { x: 1530, y: 1180 }, null, 50)).toEqual({
      point: { x: 1500, y: 1200 },
      kind: 'corner',
    });
  });

  it('se engancha a la cara interior de un muro', () => {
    expect(snapMeasurePoint(outlines, { x: 1000, y: 30 }, null, 50)).toEqual({
      point: { x: 1000, y: 0 },
      kind: 'edge',
    });
  });

  it('desde un punto anterior bloquea la dirección cada 45°', () => {
    const snap = snapMeasurePoint(outlines, { x: 1000, y: 820 }, { x: 600, y: 800 }, 50);
    expect(snap.kind).toBe('angle');
    expect(snap.point.y).toBeCloseTo(800);
    expect(snap.point.x).toBeCloseTo(1000);
  });

  it('libre (Alt) no ajusta', () => {
    expect(snapMeasurePoint(outlines, { x: 1530, y: 1180 }, null, 50, true)).toEqual({
      point: { x: 1530, y: 1180 },
      kind: 'free',
    });
  });
});
