/** Punto medido: planta (mm) y altura sobre el nivel (mm). */
export interface MeasurePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const measureDistance = (a: MeasurePoint, b: MeasurePoint): number =>
  Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
