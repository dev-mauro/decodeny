import { describe, expect, it } from 'vitest';
import { createEyeHeight, MAX_LAG, stepEyeHeight } from './eye-height';

describe('altura de los ojos', () => {
  it('acompaña un escalón de a poco, sin quedarse atrás más de lo debido', () => {
    const eye = createEyeHeight();
    expect(stepEyeHeight(eye, 1, 1 / 60)).toBe(1);
    // El cuerpo sube 10 cm de golpe: la cámara lo sigue en unos cuadros.
    const first = stepEyeHeight(eye, 1.1, 1 / 60);
    expect(first).toBeGreaterThan(1);
    expect(first).toBeLessThan(1.05);
    let y = first;
    for (let i = 0; i < 30; i++) y = stepEyeHeight(eye, 1.1, 1 / 60);
    expect(y).toBeCloseTo(1.1, 2);
  });

  it('nunca se aleja del cuerpo más que el retardo máximo', () => {
    const eye = createEyeHeight();
    stepEyeHeight(eye, 0, 1 / 60);
    // Subiendo rápido (un ascensor), siempre cerca.
    for (let i = 1; i <= 60; i++) {
      const target = i * 0.02;
      expect(target - stepEyeHeight(eye, target, 1 / 60)).toBeLessThanOrEqual(MAX_LAG + 1e-9);
    }
  });

  it('un salto grande (reaparecer) se toma de una vez', () => {
    const eye = createEyeHeight();
    stepEyeHeight(eye, 0, 1 / 60);
    expect(stepEyeHeight(eye, 5, 1 / 60)).toBe(5);
  });
});
