import { describe, expect, it } from 'vitest';
import { gridLines } from './floor-grid-lines';
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

describe('cuadrícula del suelo', () => {
  it('pone las líneas en múltiplos exactos del paso y separa las mayores', () => {
    const { minor, major } = gridLines({ x: -0.3, z: 0.1 }, { x: 1.2, z: 0.9 }, 0.25, 4, 0.003);
    const xs = new Set<number>();
    for (let i = 0; i < minor.length; i += 6) if (minor[i + 2] !== minor[i + 5]) xs.add(minor[i]!);
    for (const x of xs) expect(Math.abs((x / 0.25) % 1)).toBeLessThan(1e-9);
    // Cada metro (4 × 0,25) es una línea mayor: x = 0 y x = 1.
    const majorXs = [];
    for (let i = 0; i < major.length; i += 6)
      if (major[i + 2] !== major[i + 5]) majorXs.push(major[i]);
    expect(majorXs).toEqual([0, 1]);
  });
});
