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

/** Distancia (mm) dentro de la cual un mueble se junta o alinea con otro. */
export const NEIGHBOR_SNAP_DISTANCE = 120;

export interface ItemSnap {
  readonly position: Vec2;
  readonly rotation: number;
  /** Se apoyó contra la cara interior de un muro. */
  readonly againstWall: boolean;
  /** Índices (en `options.neighbors`) de los muebles con los que quedó junto o alineado. */
  readonly neighbors: readonly number[];
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
  /**
   * Huellas de otros muebles (el dominio no conoce el catálogo: la aplicación las calcula). El
   * mueble se junta con el que tenga cara a cara (costado con costado) y se alinea con sus bordes.
   */
  readonly neighbors?: readonly (readonly Vec2[])[];
  /** Distancia de ajuste a otros muebles (mm). */
  readonly neighborThreshold?: number;
  /** Paso de la grilla cuando no hay muros cerca (mm). */
  readonly gridStep?: number;
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
  let best: { distance: number; position: Vec2; rotation: number; normal: Vec2 } | null = null;
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
        normal: n,
      };
    }
  }
  const step = options.gridStep ?? ITEM_GRID_STEP;
  const grid = (v: number) => Math.round(v / step) * step;
  const placed = best
    ? { position: best.position, rotation: best.rotation, wall: best.normal }
    : { position: { x: grid(center.x), y: grid(center.y) }, rotation, wall: null };
  const aligned = options.wallMounted
    ? { position: placed.position, neighbors: [] }
    : snapToNeighbors(
        placed.position,
        placed.rotation,
        env,
        options.neighbors ?? [],
        options.neighborThreshold ?? NEIGHBOR_SNAP_DISTANCE,
        placed.wall,
      );
  return {
    position: { x: Math.round(aligned.position.x), y: Math.round(aligned.position.y) },
    rotation: placed.rotation,
    againstWall: best !== null,
    neighbors: aligned.neighbors,
  };
}

interface Edge {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly u: Vec2;
  /** Normal hacia afuera del polígono. */
  readonly n: Vec2;
  readonly length: number;
}

function polygonEdges(points: readonly Vec2[]): Edge[] {
  const ccw = isCounterClockwise(points);
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const d = sub(b, a);
    const u = normalize(d);
    // Afuera es la derecha del recorrido antihorario.
    const left = perpLeft(u);
    return { a, b, u, n: ccw ? scale(left, -1) : left, length: Math.hypot(d.x, d.y) };
  });
}

const PARALLEL = 0.999;

/** Largo en común de dos bordes paralelos, medido a lo largo de `m`. */
function overlapAlong(m: Edge, e: Edge): number {
  const t1 = dot(sub(e.a, m.a), m.u);
  const t2 = dot(sub(e.b, m.a), m.u);
  return Math.min(Math.max(t1, t2), m.length) - Math.max(Math.min(t1, t2), 0);
}

/**
 * Junta el mueble con un vecino cara a cara (el costado más cercano dentro del umbral) y luego,
 * en el eje perpendicular, alinea un borde con el del vecino que mira hacia el mismo lado (p. ej.
 * frentes alineados). Contra un muro solo se desliza a lo largo del muro.
 */
function snapToNeighbors(
  position: Vec2,
  rotation: number,
  env: ItemEnvelope,
  neighbors: readonly (readonly Vec2[])[],
  threshold: number,
  wallNormal: Vec2 | null,
): { position: Vec2; neighbors: number[] } {
  if (neighbors.length === 0) return { position, neighbors: [] };
  const others = neighbors.map(polygonEdges);
  const movingEdges = (p: Vec2) =>
    polygonEdges(itemFootprint({ position: { ...p, z: 0 }, rotation }, env));
  const free = (n: Vec2) => !wallNormal || Math.abs(dot(n, wallNormal)) < 1 - PARALLEL;

  // 1. Contacto: borde propio frente a un borde ajeno (normales opuestas), con largo en común.
  let touch: { shift: Vec2; axis: Vec2; index: number; gap: number } | null = null;
  for (const m of movingEdges(position)) {
    if (!free(m.n)) continue;
    others.forEach((edges, index) => {
      for (const e of edges) {
        if (dot(m.n, e.n) > -PARALLEL) continue;
        const gap = dot(sub(e.a, m.a), m.n);
        if (Math.abs(gap) > threshold || overlapAlong(m, e) <= 1) continue;
        if (!touch || Math.abs(gap) < Math.abs(touch.gap)) {
          touch = { shift: scale(m.n, gap), axis: m.n, index, gap };
        }
      }
    });
  }
  let snapped = position;
  const matched: number[] = [];
  const contact = touch as { shift: Vec2; axis: Vec2; index: number } | null;
  if (contact) {
    snapped = add(position, contact.shift);
    matched.push(contact.index);
  }

  // 2. Alineación en el otro eje: bordes que miran hacia el mismo lado, en la misma recta.
  let align: { shift: Vec2; index: number; offset: number } | null = null;
  for (const m of movingEdges(snapped)) {
    if (!free(m.n)) continue;
    if (contact && Math.abs(dot(m.n, contact.axis)) > 1 - PARALLEL) continue;
    others.forEach((edges, index) => {
      if (contact && index !== contact.index) return;
      for (const e of edges) {
        if (dot(m.n, e.n) < PARALLEL) continue;
        const offset = dot(sub(e.a, m.a), m.n);
        if (Math.abs(offset) > threshold || Math.abs(offset) < 1e-6) continue;
        if (!align || Math.abs(offset) < Math.abs(align.offset)) {
          align = { shift: scale(m.n, offset), index, offset };
        }
      }
    });
  }
  const alignment = align as { shift: Vec2; index: number } | null;
  if (alignment) {
    snapped = add(snapped, alignment.shift);
    if (!matched.includes(alignment.index)) matched.push(alignment.index);
  }
  return { position: snapped, neighbors: matched };
}

/** Altura del cielo (mm, sobre el nivel) en un punto: la de su recinto, o la del muro más alto. */
export function ceilingHeightAt(level: Level, point: Vec2): number {
  const room = level.rooms.find((r) => pointInPolygon(point, roomInteriorPolygon(level, r)));
  const walls = room
    ? roomEdges(level, room).flatMap((e) => (e.wall ? [e.wall] : []))
    : level.walls;
  return walls.length > 0 ? Math.max(...walls.map((w) => w.height)) : 2400;
}
