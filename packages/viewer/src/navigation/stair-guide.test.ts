import { describe, expect, it } from 'vitest';
import type { Vec3Tuple } from '../coords';
import { assistStep, newGuideState, type StairGuide } from './stair-guide';

/** Radio de la persona (m). */
const R = 0.25;

/** Un tramo recto de 1 m de ancho que sube hacia −Z (el norte) de 0 a 2,8 m en 4 m. */
const straight: StairGuide = {
  id: 's',
  points: [
    [0, 0, 0],
    [0, 2.8, -4],
  ],
  halfWidth: 0.5,
};

/** Un cuarto de vuelta de caracol (radio 0,5 m) que sube antihorario, en tablones de 10°. */
const quarter: StairGuide = {
  id: 'c',
  points: Array.from({ length: 10 }, (_, i) => {
    const a = (i * 10 * Math.PI) / 180;
    return [0.5 * Math.cos(a), i * 0.1, -0.5 * Math.sin(a)] as const;
  }),
  halfWidth: 0.35,
};

const deg = (d: number) => (d * Math.PI) / 180;
/** Dirección (x–z) a `d` grados del norte, hacia el este. */
const towards = (d: number): [number, number] => [Math.sin(deg(d)), -Math.cos(deg(d))];
const assist = (feet: Vec3Tuple, d: [number, number], guide = straight) =>
  assistStep([guide], feet, d, R, newGuideState());

describe('asistencia de las escaleras', () => {
  it('casi a lo largo del tramo, el paso se endereza con él (subiendo o bajando)', () => {
    const up = assist([0, 1.4, -2], towards(10))!;
    expect(up.direction[0]).toBeCloseTo(0, 5);
    expect(up.direction[1]).toBeLessThan(0);
    const down = assist([0, 1.4, -2], towards(190))!;
    expect(down.direction[0]).toBeCloseTo(0, 5);
    expect(down.direction[1]).toBeGreaterThan(0);
  });

  it('de costado o en diagonal abierta, va hacia donde pide la persona', () => {
    for (const d of [50, 90, 135]) {
      const free = assist([0, 1.4, -2], towards(d))!;
      const length = Math.hypot(...free.direction);
      expect(free.direction[0] / length).toBeCloseTo(towards(d)[0], 5);
      expect(free.direction[1] / length).toBeCloseTo(towards(d)[1], 5);
      expect(free.yawDelta).toBe(0);
    }
  });

  it('en la pendiente se va a la velocidad de caminar a lo largo de la escalera', () => {
    const r = assist([0, 1.4, -2], [0, -1])!;
    // Pendiente 0,7: en planta, 1/√(1 + 0,7²) de lo pedido.
    expect(Math.hypot(...r.direction)).toBeCloseTo(1 / Math.hypot(1, 0.7), 2);
    // De costado no se sube ni se baja: la velocidad en planta es la pedida.
    expect(Math.hypot(...assist([0, 1.4, -2], [0.5, 0])!.direction)).toBeCloseTo(0.5, 5);
  });

  it('da la altura de los pies apoyados en la escalera, también parado', () => {
    // A media escalera, algo por encima de la línea: la persona se apoya por delante.
    const mid = assist([0, 1.4, -2], [0, 0])!;
    expect(mid.direction).toEqual([0, 0]);
    const onSlope = 1.4 + R * (Math.hypot(1, 0.7) - 1);
    expect(mid.footing.floor).toBeGreaterThanOrEqual(onSlope - 1e-6);
    expect(mid.footing.floor).toBeLessThan(onSlope + 0.01);
    // Al pie, todavía en el piso, la altura sube de a poco (sin escalón al entrar).
    const before = assist([0, 0, 0.3], [0, -1])!.footing.floor;
    const start = assist([0, 0, 0], [0, -1])!.footing.floor;
    expect(before).toBeCloseTo(0, 3);
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(0.15);
  });

  it('no hay escalera fuera de su ancho de paso o lejos en altura', () => {
    expect(assist([0.6, 0, -1], towards(0))).toBeNull();
    expect(assist([0, 0, -2], towards(0))).toBeNull();
    expect(assist([3, 0, 2], towards(0))).toBeNull();
  });

  it('al pie, se endereza solo si se va hacia la escalera', () => {
    // Medio metro antes del primer peldaño, entrando algo en diagonal.
    const entering = assist([0.1, 0, 0.4], towards(10))!;
    expect(entering.direction[0]).toBeCloseTo(0, 5);
    // Alejándose de la escalera, nada.
    const leaving = assist([0.1, 0, 0.4], towards(170))!;
    expect(leaving.direction[0] / Math.hypot(...leaving.direction)).toBeCloseTo(towards(170)[0], 5);
  });

  it('en un tramo recto la mirada no gira', () => {
    const state = newGuideState();
    assistStep([straight], [0, 1.4, -2], towards(0), R, state);
    expect(assistStep([straight], [0, 1.5, -2.1], towards(0), R, state)!.yawDelta).toBe(0);
  });

  it('en una caracol la mirada acompaña el giro de a poco, sin saltos entre tablones', () => {
    const state = newGuideState();
    const deltas: number[] = [];
    // Avanzando por la línea de paso, de 1° en 1°, mirando siempre hacia donde sube.
    for (let a = 20; a <= 60; a++) {
      const r = deg(a);
      const tangent: [number, number] = [-Math.sin(r), -Math.cos(r)];
      const feet: Vec3Tuple = [0.5 * Math.cos(r), a / 100, -0.5 * Math.sin(r)];
      const step = assistStep([quarter], feet, tangent, R, state)!;
      if (a > 20) deltas.push(step.yawDelta);
    }
    // Gira lo que gira la escalera (40°), repartido parejo: ningún paso salta.
    expect(deltas.reduce((s, d) => s + d, 0)).toBeCloseTo(deg(40), 1);
    for (const d of deltas) expect(Math.abs(d - deg(1))).toBeLessThan(deg(0.6));
  });
});
