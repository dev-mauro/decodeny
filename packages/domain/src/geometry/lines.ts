import { add, cross, EPSILON, scale, sub, type Vec2 } from './vec2';

/**
 * Intersección de dos rectas infinitas `p + t·d` y `q + s·e`.
 * Devuelve `null` si son (casi) paralelas.
 */
export function intersectLines(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const denom = cross(d, e);
  if (Math.abs(denom) < EPSILON) return null;
  const t = cross(sub(q, p), e) / denom;
  return add(p, scale(d, t));
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  const v = cross(sub(b, a), sub(c, a));
  if (Math.abs(v) < EPSILON) return 0;
  return v > 0 ? 1 : -1;
}

function onSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    Math.min(a.x, b.x) - EPSILON <= p.x &&
    p.x <= Math.max(a.x, b.x) + EPSILON &&
    Math.min(a.y, b.y) - EPSILON <= p.y &&
    p.y <= Math.max(a.y, b.y) + EPSILON
  );
}

/** ¿Se tocan o cruzan los segmentos `a1a2` y `b1b2`? (incluye contactos en extremos). */
export function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, a2, b1)) return true;
  if (o2 === 0 && onSegment(a1, a2, b2)) return true;
  if (o3 === 0 && onSegment(b1, b2, a1)) return true;
  if (o4 === 0 && onSegment(b1, b2, a2)) return true;
  return false;
}
