import { intersectLines, segmentsIntersect } from './lines';
import { add, distance, dot, normalize, perpLeft, scale, sub, type Vec2 } from './vec2';

export interface Bounds {
  readonly min: Vec2;
  readonly max: Vec2;
}

/** Área con signo (fórmula del lazo): > 0 si el polígono es antihorario. */
export function signedArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export const polygonArea = (points: readonly Vec2[]): number => Math.abs(signedArea(points));
export const isCounterClockwise = (points: readonly Vec2[]): boolean => signedArea(points) > 0;

export function perimeter(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += distance(points[i]!, points[(i + 1) % points.length]!);
  }
  return sum;
}

/** Centroide de área (cae al promedio de vértices si el área es nula). */
export function centroid(points: readonly Vec2[]): Vec2 {
  const area = signedArea(points);
  if (Math.abs(area) < 1e-9) {
    const s = points.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return scale(s, 1 / Math.max(points.length, 1));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function bounds(points: readonly Vec2[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/**
 * Desplaza cada arista `i` (de `p[i]` a `p[i+1]`) una distancia `offsets[i]` hacia su
 * **izquierda** y recalcula los vértices como intersección de aristas consecutivas.
 * Para un polígono antihorario, offset positivo = hacia adentro.
 */
export function offsetPolygon(points: readonly Vec2[], offsets: readonly number[]): Vec2[] {
  const n = points.length;
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n]!;
    const dir = normalize(sub(q, p));
    return { origin: add(p, scale(perpLeft(dir), offsets[i] ?? 0)), dir };
  });
  return points.map((p, i) => {
    const prev = lines[(i - 1 + n) % n]!;
    const curr = lines[i]!;
    return (
      intersectLines(prev.origin, prev.dir, curr.origin, curr.dir) ??
      add(p, scale(perpLeft(curr.dir), offsets[i] ?? 0))
    );
  });
}

/** Polígono simple: sin aristas de largo nulo ni cruces entre aristas no adyacentes. */
export function isSimplePolygon(points: readonly Vec2[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    if (distance(points[i]!, points[(i + 1) % n]!) < 1e-9) return false;
  }
  for (let i = 0; i < n; i++) {
    const a1 = points[i]!;
    const a2 = points[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsIntersect(a1, a2, points[j]!, points[(j + 1) % n]!)) return false;
    }
  }
  return Math.abs(signedArea(points)) > 1e-9;
}

/** Punto dentro de polígono (ray casting). Los puntos sobre el borde quedan indefinidos. */
export function pointInPolygon(p: Vec2, points: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Distancia de un punto al segmento `ab`. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const lengthSq = dot(ab, ab);
  if (lengthSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lengthSq));
  return distance(p, add(a, scale(ab, t)));
}

/** Distancia de un punto al borde de un polígono. */
export function distanceToPolygonEdge(p: Vec2, points: readonly Vec2[]): number {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    min = Math.min(min, distanceToSegment(p, points[i]!, points[(i + 1) % points.length]!));
  }
  return min;
}

/**
 * Punto interior "cómodo" de un polígono (aproxima el polo de inaccesibilidad): el candidato
 * de una grilla —más el centroide— más alejado de los bordes. Útil para ubicar a una persona
 * dentro de un recinto con forma de L o U, donde el centroide puede caer afuera. Los
 * `obstacles` (p. ej. muebles) se evitan.
 */
export function interiorPoint(
  points: readonly Vec2[],
  resolution = 24,
  obstacles: readonly (readonly Vec2[])[] = [],
): Vec2 {
  const b = bounds(points);
  const candidates: Vec2[] = [centroid(points)];
  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      candidates.push({
        x: b.min.x + ((b.max.x - b.min.x) * i) / resolution,
        y: b.min.y + ((b.max.y - b.min.y) * j) / resolution,
      });
    }
  }
  let best = candidates[0]!;
  let bestDistance = -Infinity;
  for (const c of candidates) {
    if (!pointInPolygon(c, points)) continue;
    if (obstacles.some((o) => pointInPolygon(c, o))) continue;
    const d = Math.min(
      distanceToPolygonEdge(c, points),
      ...obstacles.map((o) => distanceToPolygonEdge(c, o)),
    );
    if (d > bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}
