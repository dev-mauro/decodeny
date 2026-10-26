import { add, dot, scale, sub, type Vec2 } from '@decodeny/domain';

/** Recorta un polígono convexo a la franja `a ≤ dot(p − origin, dir) ≤ b` (Sutherland–Hodgman). */
export function clipToSlab(
  polygon: readonly Vec2[],
  origin: Vec2,
  dir: Vec2,
  a: number,
  b: number,
): Vec2[] {
  const along = (p: Vec2) => dot(sub(p, origin), dir);
  const clip = (points: readonly Vec2[], inside: (t: number) => boolean, limit: number) => {
    const out: Vec2[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const q = points[(i + 1) % points.length]!;
      const tp = along(p);
      const tq = along(q);
      if (inside(tp)) out.push(p);
      if (inside(tp) !== inside(tq)) {
        const k = (limit - tp) / (tq - tp);
        out.push(add(p, scale(sub(q, p), k)));
      }
    }
    return out;
  };
  return clip(
    clip(polygon, (t) => t >= a, a),
    (t) => t <= b,
    b,
  );
}
