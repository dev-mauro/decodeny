import { describe, expect, it } from 'vitest';
import { clipToSlab } from './section-geometry';

describe('corte de muros', () => {
  it('recorta la huella de un muro a un tramo de su eje', () => {
    const wall = [
      { x: 0, y: -50 },
      { x: 4000, y: -50 },
      { x: 4000, y: 50 },
      { x: 0, y: 50 },
    ];
    const piece = clipToSlab(wall, { x: 0, y: 0 }, { x: 1, y: 0 }, 1000, 2500);
    const xs = piece.map((p) => p.x);
    expect(Math.min(...xs)).toBe(1000);
    expect(Math.max(...xs)).toBe(2500);
    expect(piece).toHaveLength(4);
    expect(clipToSlab(wall, { x: 0, y: 0 }, { x: 1, y: 0 }, 5000, 6000)).toHaveLength(0);
  });
});
