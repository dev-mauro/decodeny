import { add, cross, dot, length, normalize, perpLeft, scale, sub, type Vec2 } from '../geometry';
import { nodePositions, requireRoom, roomEdges } from './queries';
import type { Level } from './types';

/**
 * Distancia (mm) dentro de la cual un recinto arrastrado se alinea con los muros vecinos: poca,
 * un imán que actúa solo de cerca (la vista suele pasar una según el zoom, ver `RoomDragEvent`).
 */
export const ROOM_SNAP_DISTANCE = 120;
/** Paso de la grilla cuando no hay muros cerca (mm). */
export const ROOM_GRID_STEP = 10;

const PARALLEL_SIN = 0.01;

export interface RoomSnap {
  /** Traslación ajustada (mm, enteros). */
  readonly delta: Vec2;
  /** Muros de otros recintos con los que quedó alineado (para resaltarlos). */
  readonly wallIds: readonly string[];
}

interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly dir: Vec2;
  readonly length: number;
}

interface Target extends Segment {
  readonly wallId: string;
}

function segment(a: Vec2, b: Vec2): Segment {
  const d = sub(b, a);
  return { a, b, dir: normalize(d), length: length(d) };
}

const translate = (s: Segment, d: Vec2): Segment => ({ ...s, a: add(s.a, d), b: add(s.b, d) });

/** ¿Se solapan los segmentos paralelos al proyectarlos sobre `m`? */
function overlapAlong(m: Segment, t: Segment): boolean {
  const p1 = dot(sub(t.a, m.a), m.dir);
  const p2 = dot(sub(t.b, m.a), m.dir);
  return Math.min(Math.max(p1, p2), m.length) - Math.max(Math.min(p1, p2), 0) > 1;
}

interface AxisSnap {
  readonly normal: Vec2;
  /** Distancia con signo a mover a lo largo de `normal`. */
  readonly offset: number;
  readonly moving: Segment;
  readonly target: Target;
}

/** Mejor alineación de ejes entre un muro del recinto y un muro vecino paralelo. */
function bestAxisSnap(
  moving: readonly Segment[],
  targets: readonly Target[],
  threshold: number,
  accept: (normal: Vec2) => boolean,
): AxisSnap | null {
  let best: AxisSnap | null = null;
  for (const m of moving) {
    const normal = perpLeft(m.dir);
    if (!accept(normal)) continue;
    for (const t of targets) {
      if (Math.abs(cross(m.dir, t.dir)) > PARALLEL_SIN) continue;
      const offset = dot(sub(t.a, m.a), normal);
      if (Math.abs(offset) > threshold || !overlapAlong(m, t)) continue;
      if (!best || Math.abs(offset) < Math.abs(best.offset))
        best = { normal, offset, moving: m, target: t };
    }
  }
  return best;
}

const snapToGrid = (v: number, axisAligned: boolean, step = ROOM_GRID_STEP) =>
  axisAligned ? Math.round(v / step) * step : Math.round(v);

/**
 * Ajusta la traslación de un recinto para que sus muros coincidan en eje con los de los
 * recintos vecinos (y así compartan tabique), primero en la dirección más cercana y luego,
 * si es posible, en la perpendicular (alineando esquinas o un segundo muro).
 */
export function snapRoomTranslation(
  level: Level,
  roomId: string,
  delta: Vec2,
  threshold = ROOM_SNAP_DISTANCE,
  /** Paso de la grilla cuando no hay muros cerca (mm). */
  gridStep = ROOM_GRID_STEP,
): RoomSnap {
  return snapRoomsTranslation(level, [roomId], delta, threshold, gridStep);
}

/**
 * Ajuste del desplazamiento de varios recintos que se mueven juntos: sus muros se pegan a los
 * de los demás recintos (no entre ellos) dentro de `threshold`; si no, a la grilla.
 */
export function snapRoomsTranslation(
  level: Level,
  roomIds: readonly string[],
  delta: Vec2,
  threshold = ROOM_SNAP_DISTANCE,
  gridStep = ROOM_GRID_STEP,
): RoomSnap {
  const group = new Set(roomIds);
  const positions = nodePositions(level);
  const base = roomIds.flatMap((roomId) => {
    const room = requireRoom(level, roomId);
    return room.boundary.map((id, i) =>
      segment(positions.get(id)!, positions.get(room.boundary[(i + 1) % room.boundary.length]!)!),
    );
  });
  const seen = new Set<string>();
  const targets: Target[] = [];
  for (const other of level.rooms) {
    if (group.has(other.id)) continue;
    for (const edge of roomEdges(level, other)) {
      const wall = edge.wall;
      if (!wall || seen.has(wall.id)) continue;
      seen.add(wall.id);
      // Los muros que el recinto comparte con el vecino también cuentan: lo mantienen adosado.
      const a = positions.get(wall.start);
      const b = positions.get(wall.end);
      if (a && b) targets.push({ ...segment(a, b), wallId: wall.id });
    }
  }

  const first = bestAxisSnap(
    base.map((s) => translate(s, delta)),
    targets,
    threshold,
    () => true,
  );
  if (!first) {
    return {
      delta: { x: snapToGrid(delta.x, true, gridStep), y: snapToGrid(delta.y, true, gridStep) },
      wallIds: [],
    };
  }
  let snapped = add(delta, scale(first.normal, first.offset));
  const wallIds = [first.target.wallId];
  const along = perpLeft(first.normal);

  const second = bestAxisSnap(
    base.map((s) => translate(s, snapped)),
    targets,
    threshold,
    (normal) => Math.abs(dot(normal, along)) > 0.5,
  );
  if (second) {
    snapped = add(snapped, scale(along, second.offset / dot(along, second.normal)));
    wallIds.push(second.target.wallId);
  } else {
    // Alinea esquinas: extremos del muro alineado con los del muro vecino.
    const m = translate(first.moving, sub(snapped, delta));
    let best: number | null = null;
    for (const p of [m.a, m.b]) {
      for (const q of [first.target.a, first.target.b]) {
        const t = dot(sub(q, p), along);
        if (Math.abs(t) <= threshold && (best === null || Math.abs(t) < Math.abs(best))) best = t;
      }
    }
    if (best !== null) snapped = add(snapped, scale(along, best));
    else {
      const axisAligned = Math.abs(along.x) < 1e-9 || Math.abs(along.y) < 1e-9;
      const free = dot(snapped, along);
      snapped = add(snapped, scale(along, snapToGrid(free, axisAligned, gridStep) - free));
    }
  }
  return { delta: { x: Math.round(snapped.x), y: Math.round(snapped.y) }, wallIds };
}

/** Distancia (mm) para alinear un nodo arrastrado con sus vecinos (muros a escuadra). */
export const NODE_SNAP_DISTANCE = 150;

/**
 * Ajuste al arrastrar un nodo: alinea su x o su y con la de los nodos conectados por un muro
 * (deja los muros horizontales o verticales) y redondea a la grilla de 1 cm.
 */
export function snapNodePosition(
  level: Level,
  nodeId: string,
  p: Vec2,
  threshold = NODE_SNAP_DISTANCE,
  gridStep = ROOM_GRID_STEP,
): Vec2 {
  const positions = nodePositions(level);
  const neighbors = level.walls.flatMap((w) =>
    w.start === nodeId ? [w.end] : w.end === nodeId ? [w.start] : [],
  );
  let x = Math.round(p.x / gridStep) * gridStep;
  let y = Math.round(p.y / gridStep) * gridStep;
  let bestX = threshold;
  let bestY = threshold;
  for (const id of neighbors) {
    const q = positions.get(id);
    if (!q) continue;
    if (Math.abs(q.x - p.x) < bestX) {
      bestX = Math.abs(q.x - p.x);
      x = q.x;
    }
    if (Math.abs(q.y - p.y) < bestY) {
      bestY = Math.abs(q.y - p.y);
      y = q.y;
    }
  }
  return { x, y };
}

/** Ángulos a los que se bloquea un muro dibujado (cada 45°) y margen de captura (radianes). */
const DRAW_ANGLE_STEP = Math.PI / 4;
const DRAW_ANGLE_CAPTURE = (6 * Math.PI) / 180;

export type DrawSnapKind = 'node' | 'wall' | 'angle' | 'grid' | 'free';

export interface DrawSnap {
  /** Punto ajustado (mm, enteros). */
  readonly point: Vec2;
  readonly kind: DrawSnapKind;
  /**
   * Nodos con los que el punto quedó parejo (misma x o misma y): la vista dibuja una guía desde
   * cada uno. Evita, p. ej., que un muro paralelo a otro termine unos centímetros más allá.
   */
  readonly guides?: readonly Vec2[];
}

/**
 * Alinea el punto con nodos existentes: en x, en y o en ambas si `axes` lo permite (con la
 * dirección bloqueada solo se ajusta el eje en que se avanza). Devuelve el punto y las guías.
 */
function alignToNodes(
  positions: ReadonlyMap<string, Vec2>,
  p: Vec2,
  axes: { readonly x: boolean; readonly y: boolean },
  tolerance: number,
  exclude: Vec2 | null,
): { point: Vec2; guides: Vec2[] } {
  let bestX: Vec2 | null = null;
  let bestY: Vec2 | null = null;
  for (const n of positions.values()) {
    if (n.x === exclude?.x && n.y === exclude.y) continue;
    const dx = Math.abs(n.x - p.x);
    const dy = Math.abs(n.y - p.y);
    if (axes.x && dx <= tolerance && (!bestX || dx < Math.abs(bestX.x - p.x))) bestX = n;
    if (axes.y && dy <= tolerance && (!bestY || dy < Math.abs(bestY.y - p.y))) bestY = n;
  }
  return {
    point: { x: bestX ? bestX.x : p.x, y: bestY ? bestY.y : p.y },
    guides: [bestX, bestY].filter((g): g is Vec2 => g !== null),
  };
}

/**
 * Ajuste del punto al dibujar muros: un nodo cercano, luego un muro cercano (si además el
 * tramo va bloqueado a 45°, el punto donde la dirección bloqueada corta ese muro), luego la
 * dirección bloqueada a 45° con el largo redondeado a 1 cm y, si no, la grilla de 1 cm.
 * `tolerance` está en mm (depende del zoom de la vista); `free` (Alt) solo redondea.
 */
export function snapDrawPoint(
  level: Level,
  raw: Vec2,
  from: Vec2 | null,
  tolerance: number,
  free = false,
  /** Paso de la grilla y del largo bloqueado (mm). */
  gridStep = ROOM_GRID_STEP,
): DrawSnap {
  const round = (p: Vec2): Vec2 => ({ x: Math.round(p.x), y: Math.round(p.y) });
  if (free) return { point: round(raw), kind: 'free' };
  const positions = nodePositions(level);

  let nearestNode: Vec2 | null = null;
  let best = tolerance;
  for (const p of positions.values()) {
    const d = length(sub(p, raw));
    if (d <= best) {
      best = d;
      nearestNode = p;
    }
  }
  if (nearestNode) return { point: { ...nearestNode }, kind: 'node' };

  // Dirección bloqueada a múltiplos de 45° respecto del punto anterior.
  let locked: Vec2 | null = null;
  if (from) {
    const d = sub(raw, from);
    if (length(d) > 0) {
      const angle = Math.atan2(d.y, d.x);
      const snapped = Math.round(angle / DRAW_ANGLE_STEP) * DRAW_ANGLE_STEP;
      if (Math.abs(angle - snapped) <= DRAW_ANGLE_CAPTURE) {
        locked = { x: Math.cos(snapped), y: Math.sin(snapped) };
        // Evita -0 y ruido de punto flotante en las direcciones cardinales.
        locked = { x: Math.round(locked.x * 1e9) / 1e9, y: Math.round(locked.y * 1e9) / 1e9 };
      }
    }
  }

  let nearestWall: { a: Vec2; b: Vec2; projection: Vec2; distance: number } | null = null;
  for (const wall of level.walls) {
    const a = positions.get(wall.start);
    const b = positions.get(wall.end);
    if (!a || !b) continue;
    const ab = sub(b, a);
    const len2 = dot(ab, ab);
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, dot(sub(raw, a), ab) / len2));
    const projection = add(a, scale(ab, t));
    const d = length(sub(raw, projection));
    if (d <= tolerance && (!nearestWall || d < nearestWall.distance)) {
      nearestWall = { a, b, projection, distance: d };
    }
  }
  if (nearestWall) {
    if (from && locked) {
      const dir = sub(nearestWall.b, nearestWall.a);
      const denom = cross(locked, dir);
      if (Math.abs(denom) > 1e-9) {
        const t = cross(sub(nearestWall.a, from), dir) / denom;
        const hit = add(from, scale(locked, t));
        if (t > 0 && length(sub(hit, raw)) <= 2 * tolerance) {
          return { point: round(hit), kind: 'wall' };
        }
      }
    }
    return { point: round(nearestWall.projection), kind: 'wall' };
  }

  if (from && locked) {
    const along = Math.round(dot(sub(raw, from), locked) / gridStep) * gridStep;
    const point = round(add(from, scale(locked, along)));
    // Horizontal: se ajusta la x; vertical: la y; en diagonal no (movería la dirección).
    const horizontal = locked.y === 0;
    const vertical = locked.x === 0;
    if (!horizontal && !vertical) return { point, kind: 'angle' };
    const aligned = alignToNodes(positions, point, { x: horizontal, y: vertical }, tolerance, from);
    return aligned.guides.length > 0
      ? { point: aligned.point, kind: 'angle', guides: aligned.guides }
      : { point, kind: 'angle' };
  }
  const point = {
    x: Math.round(raw.x / gridStep) * gridStep,
    y: Math.round(raw.y / gridStep) * gridStep,
  };
  const aligned = alignToNodes(positions, raw, { x: true, y: true }, tolerance, from);
  if (aligned.guides.length === 0) return { point, kind: 'grid' };
  // Lo alineado toma la coordenada del nodo; el otro eje sigue en la grilla.
  const ax = aligned.guides.some(
    (g) => g.x === aligned.point.x && Math.abs(g.x - raw.x) <= tolerance,
  );
  const ay = aligned.guides.some(
    (g) => g.y === aligned.point.y && Math.abs(g.y - raw.y) <= tolerance,
  );
  return {
    point: { x: ax ? aligned.point.x : point.x, y: ay ? aligned.point.y : point.y },
    kind: 'grid',
    guides: aligned.guides,
  };
}
