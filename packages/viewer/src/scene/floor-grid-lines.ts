/**
 * Líneas de una cuadrícula horizontal de paso `step` (m) que cubre `[min, max]` en x y z, con
 * las líneas en múltiplos exactos del paso (alineada al origen del proyecto, como el plano).
 * `majorEvery`: cada cuántas líneas va una mayor (se devuelven aparte).
 */
export function gridLines(
  min: { x: number; z: number },
  max: { x: number; z: number },
  step: number,
  majorEvery: number,
  y: number,
): { minor: number[]; major: number[] } {
  const minor: number[] = [];
  const major: number[] = [];
  const x0 = Math.floor(min.x / step);
  const x1 = Math.ceil(max.x / step);
  const z0 = Math.floor(min.z / step);
  const z1 = Math.ceil(max.z / step);
  for (let i = x0; i <= x1; i++) {
    const x = i * step;
    (i % majorEvery === 0 ? major : minor).push(x, y, z0 * step, x, y, z1 * step);
  }
  for (let j = z0; j <= z1; j++) {
    const z = j * step;
    (j % majorEvery === 0 ? major : minor).push(x0 * step, y, z, x1 * step, y, z);
  }
  return { minor, major };
}
