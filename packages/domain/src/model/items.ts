import type { ItemEnvelope, ItemEnvelopeResolver } from '../catalog/item-definition';
import {
  add,
  dot,
  isCounterClockwise,
  normalize,
  offsetPolygon,
  perpLeft,
  pointInPolygon,
  scale,
  segmentsIntersect,
  sub,
  type Vec2,
} from '../geometry';
import { levelWallFootprints, roomEdges, roomInteriorPolygon } from './queries';
import type { Item, Level, Room } from './types';

const DEG = Math.PI / 180;

/** Normaliza un ángulo en grados a [0, 360). */
export function normalizeRotation(degrees: number): number {
  const r = ((degrees % 360) + 360) % 360;
  return Math.round(r * 100) / 100 === 360 ? 0 : Math.round(r * 100) / 100;
}

/** Punto del marco local del item (x a lo ancho, z hacia el frente) llevado a la planta. */
export function itemLocalToPlan(
  item: Pick<Item, 'position' | 'rotation'>,
  x: number,
  z: number,
): Vec2 {
  // En planta el frente (+z local) apunta al sur con rotación 0: (x, z) → (x, −z), luego se gira.
  const a = item.rotation * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: item.position.x + x * c + z * s, y: item.position.y + x * s - z * c };
}

/** Dirección (planta) hacia la que mira el frente de un item con esa rotación. */
export const itemFront = (rotation: number): Vec2 => ({
  x: Math.sin(rotation * DEG),
  y: -Math.cos(rotation * DEG),
});

/** Rotación (grados) cuyo frente mira en la dirección `front`. */
export const rotationFacing = (front: Vec2): number =>
  normalizeRotation(Math.atan2(front.x, -front.y) / DEG);

/** Huella del item en planta (rectángulo antihorario). */
export function itemFootprint(
  item: Pick<Item, 'position' | 'rotation'>,
  env: ItemEnvelope,
): Vec2[] {
  const w = env.width / 2;
  const d = env.depth / 2;
  return [
    itemLocalToPlan(item, -w, d),
    itemLocalToPlan(item, w, d),
    itemLocalToPlan(item, w, -d),
    itemLocalToPlan(item, -w, -d),
  ];
}

/** ¿Se superponen dos polígonos? Contactos de borde no cuentan (se encogen 2 mm). */
export function polygonsOverlap(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  const shrink = (p: readonly Vec2[]) => {
    const ccw = isCounterClockwise(p) ? [...p] : [...p].reverse();
    return offsetPolygon(
      ccw,
      ccw.map(() => 2),
    );
  };
  const pa = shrink(a);
  const pb = b;
  for (let i = 0; i < pa.length; i++) {
    for (let j = 0; j < pb.length; j++) {
      if (segmentsIntersect(pa[i]!, pa[(i + 1) % pa.length]!, pb[j]!, pb[(j + 1) % pb.length]!)) {
        return true;
      }
    }
  }
  return pointInPolygon(pa[0]!, pb) || pointInPolygon(pb[0]!, pa);
}

export type ItemWarning = 'overlap' | 'wall';

/** Items de este alto o menos (alfombras) no se superponen: lo demás se apoya sobre ellos. */
export const FLAT_ITEM_HEIGHT = 30;

/**
 * Avisos de ubicación (no bloquean): items que se superponen entre sí (a alturas que se
 * cruzan) o que atraviesan un muro.
 */
export function itemWarnings(
  level: Level,
  envelopeOf: ItemEnvelopeResolver,
  /** Altura de la base de cada item (los de cielo cuelgan; por defecto, `position.z`). */
  baseOf: (item: Item) => number = (item) => item.position.z,
): Map<string, ItemWarning> {
  const warnings = new Map<string, ItemWarning>();
  const items = level.items.map((item) => {
    const env = envelopeOf(item);
    return { item, env, base: baseOf(item), footprint: itemFootprint(item, env) };
  });
  const walls = [...levelWallFootprints(level).values()].map((fp) => fp.polygon);
  for (const { item, footprint } of items) {
    if (walls.some((wall) => polygonsOverlap(footprint, wall))) warnings.set(item.id, 'wall');
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      const verticalGap = a.base >= b.base + b.env.height || b.base >= a.base + a.env.height;
      const flat = a.env.height <= FLAT_ITEM_HEIGHT || b.env.height <= FLAT_ITEM_HEIGHT;
      if (verticalGap || flat || !polygonsOverlap(a.footprint, b.footprint)) continue;
      if (!warnings.has(a.item.id)) warnings.set(a.item.id, 'overlap');
      if (!warnings.has(b.item.id)) warnings.set(b.item.id, 'overlap');
    }
  }
  return warnings;
}

/** Recinto que contiene el centro del item. */
export function roomOfItem(level: Level, item: Pick<Item, 'position'>): Room | undefined {
  return level.rooms.find((room) =>
    pointInPolygon(item.position, roomInteriorPolygon(level, room)),
  );
}

/** Items cuyo centro está dentro del recinto (se mueven y eliminan con él). */
export function itemsInRoom(level: Level, room: Room): Item[] {
  const interior = roomInteriorPolygon(level, room);
  return level.items.filter((item) => pointInPolygon(item.position, interior));
}

/** Distancia (mm) dentro de la cual un mueble arrastrado se apoya en un muro. */
export const ITEM_SNAP_DISTANCE = 250;
export const ITEM_GRID_STEP = 10;

export interface ItemSnap {
  readonly position: Vec2;
  readonly rotation: number;
  /** Se apoyó contra la cara interior de un muro. */
  readonly againstWall: boolean;
}

/**
 * Ajuste al arrastrar un mueble: si su respaldo queda cerca de la cara interior de un muro,
 * se gira para mirar al recinto y se apoya en el muro; si además su costado queda cerca de una
 * esquina, se alinea con ella. Si no hay muros cerca, se redondea a la grilla.
 */
export interface ItemSnapOptions {
  /** Distancia de ajuste a muros y esquinas (mm). */
  readonly threshold?: number;
  /** Montaje en muro: siempre se apoya en el muro más cercano, esté donde esté. */
  readonly wallMounted?: boolean;
}

export function snapItemPlacement(
  level: Level,
  center: Vec2,
  rotation: number,
  env: ItemEnvelope,
  options: ItemSnapOptions = {},
): ItemSnap {
  const threshold = options.threshold ?? ITEM_SNAP_DISTANCE;
  const wallThreshold = options.wallMounted ? Infinity : threshold;
  let best: { distance: number; position: Vec2; rotation: number } | null = null;
  for (const room of level.rooms) {
    const inner = roomInteriorPolygon(level, room);
    const ccw = isCounterClockwise(inner);
    for (let i = 0; i < inner.length; i++) {
      const a = inner[i]!;
      const b = inner[(i + 1) % inner.length]!;
      const along = sub(b, a);
      const length = Math.hypot(along.x, along.y);
      if (length < env.width && !options.wallMounted) continue;
      const u = normalize(along);
      const n = ccw ? perpLeft(u) : scale(perpLeft(u), -1);
      const s = dot(sub(center, a), n);
      const distance = Math.abs(s - env.depth / 2);
      let t = dot(sub(center, a), u);
      if (distance > wallThreshold || t < 0 || t > length) continue;
      if (best && distance >= best.distance) continue;
      // Costado contra la esquina más cercana, si está dentro del umbral.
      const half = env.width / 2;
      if (Math.abs(t - half) <= threshold) t = half;
      else if (Math.abs(length - half - t) <= threshold) t = length - half;
      best = {
        distance,
        position: add(add(a, scale(u, t)), scale(n, env.depth / 2)),
        rotation: rotationFacing(n),
      };
    }
  }
  if (best) {
    return {
      position: { x: Math.round(best.position.x), y: Math.round(best.position.y) },
      rotation: best.rotation,
      againstWall: true,
    };
  }
  const grid = (v: number) => Math.round(v / ITEM_GRID_STEP) * ITEM_GRID_STEP;
  return { position: { x: grid(center.x), y: grid(center.y) }, rotation, againstWall: false };
}

/** Altura del cielo (mm, sobre el nivel) en un punto: la de su recinto, o la del muro más alto. */
export function ceilingHeightAt(level: Level, point: Vec2): number {
  const room = level.rooms.find((r) => pointInPolygon(point, roomInteriorPolygon(level, r)));
  const walls = room
    ? roomEdges(level, room).flatMap((e) => (e.wall ? [e.wall] : []))
    : level.walls;
  return walls.length > 0 ? Math.max(...walls.map((w) => w.height)) : 2400;
}
