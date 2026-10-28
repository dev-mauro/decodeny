import { Box3, OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { depthRange, rangeChanged } from './depth-range';
import { sunShadowFrame } from './sun-shadow';

/** Un departamento de 12 × 10 m y 2,4 m de alto. */
const house = new Box3(new Vector3(0, 0, -10), new Vector3(12, 2.4, 0));

describe('rango de profundidad', () => {
  it('desde afuera, near se aleja con la cámara y la escena entra entera', () => {
    const eye = new Vector3(30, 25, 30);
    const { near, far } = depthRange(eye, house);
    expect(near).toBeGreaterThan(10);
    expect(far).toBeGreaterThan(eye.distanceTo(new Vector3(0, 0, -10)));
    // Mucho mejor que 0,05 / 2000 (relación 1:40 000).
    expect(far / near).toBeLessThan(20);
  });

  it('adentro (recorrido), near queda en el mínimo y far alcanza el suelo alrededor', () => {
    const { near, far } = depthRange(new Vector3(5, 1.6, -5), house);
    expect(near).toBe(0.05);
    expect(far).toBeGreaterThanOrEqual(100);
  });

  it('sin escena, valores seguros', () => {
    expect(depthRange(new Vector3(), null)).toEqual({ near: 0.05, far: 200 });
  });

  it('solo cambia la proyección si el rango se mueve más de un 5 %', () => {
    expect(rangeChanged({ near: 10, far: 100 }, { near: 10.2, far: 101 })).toBe(false);
    expect(rangeChanged({ near: 10, far: 100 }, { near: 12, far: 100 })).toBe(true);
  });
});

describe('sombra del sol', () => {
  it('la cámara de la sombra cubre toda la casa, ajustada', () => {
    const frame = sunShadowFrame(house, 2048);
    const camera = new OrthographicCamera(
      frame.left,
      frame.right,
      frame.top,
      frame.bottom,
      frame.near,
      frame.far,
    );
    camera.position.set(...frame.position);
    camera.lookAt(...frame.target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    for (let i = 0; i < 8; i++) {
      const corner = new Vector3(
        i & 1 ? house.max.x : house.min.x,
        i & 2 ? house.max.y : house.min.y,
        i & 4 ? house.max.z : house.min.z,
      ).project(camera);
      for (const v of [corner.x, corner.y, corner.z]) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    // Antes: un cuadrado de 2,6 × el radio (~41 m de lado); ahora, apenas más que la casa.
    expect(frame.right - frame.left).toBeLessThan(20);
  });

  it('el sesgo sigue al tamaño del texel', () => {
    const small = sunShadowFrame(house, 2048);
    const big = sunShadowFrame(new Box3(new Vector3(0, 0, -40), new Vector3(48, 2.4, 0)), 2048);
    expect(big.normalBias).toBeGreaterThan(small.normalBias * 2);
    expect(small.normalBias).toBeCloseTo(((small.right - small.left) / 2048) * 1.5);
  });
});
