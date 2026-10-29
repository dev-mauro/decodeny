import { describe, expect, it } from 'vitest';
import { guidedStep, newGuideState, type StairGuide } from './stair-guide';

/** Un tramo recto que sube hacia −Z (el norte) de 0 a 2,8 m en 4 m. */
const straight: StairGuide = {
  id: 's',
  points: [
    [0, 0, 0],
    [0, 2.8, -4],
  ],
};

describe('guía de las escaleras', () => {
  it('el sentido se elige al empezar: mirar a un costado no lo invierte', () => {
    const state = newGuideState();
    // Mirando al norte (yaw 0): adelante sube.
    const up = guidedStep([straight], [0, 1.4, -2], 1, 0, state)!;
    expect(up.direction[1]).toBeLessThan(-0.9);
    // Sin soltar la tecla, mirando hacia atrás y al costado: sigue subiendo.
    const still = guidedStep([straight], [0, 1.4, -2.1], 1, (150 * Math.PI) / 180, state)!;
    expect(still.direction[1]).toBeLessThan(-0.9);
    // En un tramo recto la mirada no gira.
    expect(still.yawDelta).toBe(0);
  });

  it('al soltar y volver a avanzar mirando hacia abajo, baja', () => {
    const state = newGuideState();
    guidedStep([straight], [0, 1.4, -2], 1, 0, state);
    expect(guidedStep([straight], [0, 1.4, -2], 0, 0, state)).toBeNull();
    const down = guidedStep([straight], [0, 1.4, -2], 1, Math.PI, state)!;
    expect(down.direction[1]).toBeGreaterThan(0.9);
  });
});
