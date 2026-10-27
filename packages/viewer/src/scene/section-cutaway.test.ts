import type { WallExposure } from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { facingCutWalls, wallAt } from './section-cutaway';

/** Caja de 4 × 4 m centrada en el origen: cuatro muros exteriores y un tabique interior. */
const exposure = new Map<string, WallExposure>([
  ['south', { kind: 'exterior', mid: { x: 0, y: -2000 }, outward: { x: 0, y: -1 } }],
  ['north', { kind: 'exterior', mid: { x: 0, y: 2000 }, outward: { x: 0, y: 1 } }],
  ['west', { kind: 'exterior', mid: { x: -2000, y: 0 }, outward: { x: -1, y: 0 } }],
  ['east', { kind: 'exterior', mid: { x: 2000, y: 0 }, outward: { x: 1, y: 0 } }],
  ['partition', { kind: 'interior', mid: { x: 0, y: 0 } }],
  ['fence', { kind: 'free', mid: { x: 0, y: 9000 } }],
]);
const NONE = new Set<string>();
const sorted = (s: Set<string>) => [...s].sort();

describe('facingCutWalls', () => {
  it('desde el sur recorta el muro sur y deja enteros el del fondo y los laterales', () => {
    expect(sorted(facingCutWalls(exposure, { x: 0, y: -10_000 }, NONE))).toEqual([
      'fence',
      'partition',
      'south',
    ]);
  });

  it('desde una esquina recorta los dos muros que dan a la cámara', () => {
    expect(sorted(facingCutWalls(exposure, { x: 9000, y: -9000 }, NONE))).toEqual([
      'east',
      'fence',
      'partition',
      'south',
    ]);
  });

  it('al dar la vuelta, el muro recortado queda entero y se recorta el opuesto', () => {
    const fromSouth = facingCutWalls(exposure, { x: 0, y: -10_000 }, NONE);
    const fromNorth = facingCutWalls(exposure, { x: 0, y: 10_000 }, fromSouth);
    expect(fromNorth.has('north')).toBe(true);
    expect(fromNorth.has('south')).toBe(false);
  });

  it('con la cámara adentro, los muros perimetrales quedan enteros', () => {
    expect(sorted(facingCutWalls(exposure, { x: 500, y: 500 }, NONE))).toEqual([
      'fence',
      'partition',
    ]);
  });

  it('un muro casi de canto conserva su estado anterior (sin parpadeo)', () => {
    // Desde el oeste, a ras de la prolongación del muro sur (≈1° de su plano).
    const grazing = { x: -100_000, y: -2000 - 1500 };
    expect(facingCutWalls(exposure, grazing, new Set(['south'])).has('south')).toBe(true);
    expect(facingCutWalls(exposure, grazing, NONE).has('south')).toBe(false);
  });
});

describe('wallAt', () => {
  const footprint = (
    wallId: string,
    start: { x: number; y: number },
    dir: { x: number; y: number },
  ) => ({ wallId, start, dir, length: 4000 }) as never;
  const footprints = new Map([
    ['south', footprint('south', { x: -2000, y: -2000 }, { x: 1, y: 0 })],
    ['east', footprint('east', { x: 2000, y: -2000 }, { x: 0, y: 1 })],
  ]);

  it('elige el muro de eje más cercano', () => {
    expect(wallAt(footprints, { x: 0, y: -1900 })).toBe('south');
    expect(wallAt(footprints, { x: 1900, y: 500 })).toBe('east');
  });
});
