import { itemEnvelope } from '@decodeny/catalog';
import {
  add,
  dot,
  itemFootprint,
  roomInteriorPolygon,
  scale,
  sub,
  type Level,
  type Vec2,
} from '@decodeny/domain';

export type MeasureSnapKind = 'corner' | 'edge' | 'angle' | 'free';

export interface MeasureSnap {
  readonly point: Vec2;
  readonly kind: MeasureSnapKind;
}

/** Contornos que se miden: caras interiores de los recintos y huellas de los muebles. */
export function measureOutlines(level: Level): Vec2[][] {
  return [
    ...level.rooms.map((room) => roomInteriorPolygon(level, room)),
    ...level.items.map((item) => itemFootprint(item, itemEnvelope(item))),
  ];
}

const ANGLE_STEP = Math.PI / 4;
const ANGLE_CAPTURE = (6 * Math.PI) / 180;

/**
 * Ajuste de un punto de medición en la planta: una esquina cercana (de un recinto o un mueble),
 * luego un borde cercano (la cara interior de un muro, el costado de un mueble) y, si hay un
 * punto anterior, la dirección bloqueada cada 45°. `tolerance` en mm; `free` (Alt) no ajusta.
 */
export function snapMeasurePoint(
  outlines: readonly (readonly Vec2[])[],
  raw: Vec2,
  from: Vec2 | null,
  tolerance: number,
  free = false,
): MeasureSnap {
  if (free) return { point: raw, kind: 'free' };
  let corner: Vec2 | null = null;
  let best = tolerance;
  for (const outline of outlines) {
    for (const p of outline) {
      const d = Math.hypot(p.x - raw.x, p.y - raw.y);
      if (d <= best) {
        best = d;
        corner = p;
      }
    }
  }
  if (corner) return { point: { ...corner }, kind: 'corner' };

  let edge: Vec2 | null = null;
  best = tolerance;
  for (const outline of outlines) {
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]!;
      const ab = sub(outline[(i + 1) % outline.length]!, a);
      const len2 = dot(ab, ab);
      if (len2 === 0) continue;
      const t = Math.max(0, Math.min(1, dot(sub(raw, a), ab) / len2));
      const q = add(a, scale(ab, t));
      const d = Math.hypot(q.x - raw.x, q.y - raw.y);
      if (d <= best) {
        best = d;
        edge = q;
      }
    }
  }
  if (edge) return { point: edge, kind: 'edge' };

  if (from) {
    const d = sub(raw, from);
    const angle = Math.atan2(d.y, d.x);
    const locked = Math.round(angle / ANGLE_STEP) * ANGLE_STEP;
    if (Math.hypot(d.x, d.y) > 0 && Math.abs(angle - locked) <= ANGLE_CAPTURE) {
      const dir = { x: Math.cos(locked), y: Math.sin(locked) };
      return { point: add(from, scale(dir, dot(d, dir))), kind: 'angle' };
    }
  }
  return { point: raw, kind: 'free' };
}
