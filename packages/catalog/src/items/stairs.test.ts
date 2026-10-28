import {
  pointInPolygon,
  polygonArea,
  resolveParams,
  type AnyItemDefinition,
  type CollisionBox,
} from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { stairL, stairSpiral, stairSteps, stairStraight, stairU } from './index';

const plan = (polygon: readonly (readonly [number, number])[]) =>
  polygon.map(([x, z]) => ({ x, y: z }));

/** Punto más alto de la cara de arriba de una caja de colisión. */
function top(c: CollisionBox): number {
  const pitch = Math.abs(c.pitch ?? 0);
  return c.at[1] + (c.size[1] / 2) * Math.cos(pitch) + (c.size[2] / 2) * Math.sin(pitch);
}

describe('escaleras', () => {
  it('peldaños cómodos: contrahuella ≤ 18 cm y huella según Blondel', () => {
    for (const height of [2600, 2800, 3000, 3200]) {
      const s = stairSteps(height);
      expect(s.riser).toBeLessThanOrEqual(180);
      expect(s.riser * s.count).toBeCloseTo(height, 6);
      expect(2 * s.riser + s.tread).toBeGreaterThanOrEqual(600);
      expect(2 * s.riser + s.tread).toBeLessThanOrEqual(660);
    }
    expect(stairSteps(2800, 180, true).count % 2).toBe(0);
  });

  it.each([stairStraight, stairL, stairU].map((d) => [d.id, d] as const))(
    '%s: el hueco de la losa cubre todos los peldaños',
    (_, def: AnyItemDefinition) => {
      for (const turn of ['left', 'right']) {
        const params = resolveParams(def.params, { height: 2800, turn });
        const opening = plan(def.floorOpening!(params));
        expect(polygonArea(opening)).toBeCloseTo(polygonArea(plan(def.planOutline!(params))), 6);
        const treads = def
          .build(params)
          .filter((p) => p.kind === 'box' && p.slot === 'wood')
          .map((p) => ({ x: p.at[0], y: p.at[2] }));
        expect(treads.length).toBeGreaterThan(10);
        for (const t of treads) expect(pointInPolygon(t, opening)).toBe(true);
      }
    },
  );

  it.each([stairStraight, stairL, stairU, stairSpiral].map((d) => [d.id, d] as const))(
    '%s: las rampas de colisión llegan justo al piso de arriba',
    (_, def: AnyItemDefinition) => {
      for (const height of [2600, 3000]) {
        const colliders = def.colliders!(resolveParams(def.params, { height, railing: false }));
        const highest = Math.max(...colliders.map(top));
        expect(highest).toBeCloseTo(height, 0);
      }
    },
  );

  it('caracol: el hueco deja un sector de losa como descanso de llegada', () => {
    const params = resolveParams(stairSpiral.params, { diameter: 1600 });
    const circle = Math.PI * 800 ** 2;
    const opening = polygonArea(plan(stairSpiral.floorOpening!(params)));
    expect(opening).toBeLessThan(circle * 0.9);
    expect(opening).toBeGreaterThan(circle * 0.6);
  });
});
