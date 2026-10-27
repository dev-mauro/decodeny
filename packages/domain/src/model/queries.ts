import { DomainError } from '../errors';
import {
  bounds,
  computeWallFootprints,
  cross,
  dot,
  intersectLines,
  isCounterClockwise,
  length,
  normalize,
  perpLeft,
  scale,
  add,
  perimeter,
  polygonArea,
  sub,
  type Bounds,
  type Vec2,
  type WallFootprint,
} from '../geometry';
import type { Level, Project, Room, Wall } from './types';

export function findLevel(project: Project, levelId: string): Level | undefined {
  return project.levels.find((l) => l.id === levelId);
}

export function requireLevel(project: Project, levelId: string): Level {
  const level = findLevel(project, levelId);
  if (!level) throw new DomainError('not-found', `Nivel ${levelId} no existe`, { id: levelId });
  return level;
}

export function requireRoom(level: Level, roomId: string): Room {
  const room = level.rooms.find((r) => r.id === roomId);
  if (!room) throw new DomainError('not-found', `Recinto ${roomId} no existe`, { id: roomId });
  return room;
}

export function requireWall(level: Level, wallId: string): Wall {
  const wall = level.walls.find((w) => w.id === wallId);
  if (!wall) throw new DomainError('not-found', `Muro ${wallId} no existe`, { id: wallId });
  return wall;
}

export function nodePositions(level: Level): Map<string, Vec2> {
  return new Map(level.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}

export function requireNodePosition(positions: ReadonlyMap<string, Vec2>, nodeId: string): Vec2 {
  const p = positions.get(nodeId);
  if (!p) throw new DomainError('not-found', `Nodo ${nodeId} no existe`, { id: nodeId });
  return p;
}

/** Muro que une dos nodos, en cualquier dirección. */
export function wallBetween(level: Level, a: string, b: string): Wall | undefined {
  return level.walls.find((w) => (w.start === a && w.end === b) || (w.start === b && w.end === a));
}

export interface RoomEdge {
  readonly index: number;
  readonly from: string;
  readonly to: string;
  readonly wall: Wall | undefined;
}

export function roomEdges(level: Level, room: Room): RoomEdge[] {
  return room.boundary.map((from, index) => {
    const to = room.boundary[(index + 1) % room.boundary.length]!;
    return { index, from, to, wall: wallBetween(level, from, to) };
  });
}

/** Contorno del recinto sobre el eje de los muros. */
export function roomCenterlinePolygon(level: Level, room: Room): Vec2[] {
  const positions = nodePositions(level);
  return room.boundary.map((id) => requireNodePosition(positions, id));
}

/**
 * Contorno interior del recinto (cara interior de sus muros). Sus vértices son las esquinas de
 * los lados: los nodos intermedios de un lado recto (uniones en T con un vecino) no generan
 * vértices, salvo un escalón si los tramos del lado tienen distinto espesor.
 */
export function roomInteriorPolygon(level: Level, room: Room): Vec2[] {
  return roomInterior(level, room).outline;
}

export interface RoomMetrics {
  /** Área útil interior en mm². */
  readonly area: number;
  /** Perímetro interior en mm. */
  readonly perimeter: number;
  readonly interiorBounds: Bounds;
}

export function roomMetrics(level: Level, room: Room): RoomMetrics {
  const inner = roomInteriorPolygon(level, room);
  return { area: polygonArea(inner), perimeter: perimeter(inner), interiorBounds: bounds(inner) };
}

export function roomsOfWall(level: Level, wallId: string): Room[] {
  return level.rooms.filter((room) => roomEdges(level, room).some((e) => e.wall?.id === wallId));
}

/** Límites de todo lo construido en el nivel, o `null` si está vacío. */
export function levelBounds(level: Level): Bounds | null {
  if (level.nodes.length === 0) return null;
  return bounds(level.nodes);
}

/** Origen sugerido para un recinto nuevo: a la derecha de lo existente, con una separación. */
export function suggestRoomOrigin(level: Level, gap = 1000): Vec2 {
  const b = levelBounds(level);
  if (!b) return { x: 0, y: 0 };
  return { x: Math.round(b.max.x + gap), y: Math.round(b.min.y) };
}

export function levelWallFootprints(level: Level): Map<string, WallFootprint> {
  return computeWallFootprints(nodePositions(level), level.walls);
}

/**
 * Lado de un recinto: tramos consecutivos colineales de su contorno. Un lado puede tener
 * varios muros cuando un recinto vecino se adosa a una parte de él (unión en T).
 */
export interface RoomSide {
  readonly index: number;
  /** Índices de `roomEdges` que forman el lado, en orden. */
  readonly edgeIndices: readonly number[];
  readonly wallIds: readonly string[];
  /** Esquinas interiores del lado. */
  readonly start: Vec2;
  readonly end: Vec2;
  /** Largo interior (mm). */
  readonly length: number;
}

const COLLINEAR_SIDE_SIN = 1e-4;

/** ¿La dirección `d2` continúa en línea recta a `d1`? */
function continuesStraight(d1: Vec2, d2: Vec2): boolean {
  const l = length(d1) * length(d2);
  return l > 0 && Math.abs(cross(d1, d2)) <= COLLINEAR_SIDE_SIN * l && dot(d1, d2) > 0;
}

interface RoomInterior {
  readonly outline: Vec2[];
  readonly sides: RoomSide[];
}

const at2 = (i: number, n: number) => ((i % n) + n) % n;

function roomInterior(level: Level, room: Room): RoomInterior {
  const centerline = roomCenterlinePolygon(level, room);
  const edges = roomEdges(level, room);
  const n = centerline.length;
  const at = (i: number) => ((i % n) + n) % n;
  const sign = isCounterClockwise(centerline) ? 1 : -1;
  const lines = centerline.map((p, i) => {
    const dir = normalize(sub(centerline[at(i + 1)]!, p));
    const offset = sign * ((edges[i]?.wall?.thickness ?? 0) / 2);
    return { node: p, dir, offset, origin: add(p, scale(perpLeft(dir), offset)) };
  });
  const joinsPrevious = (i: number) => continuesStraight(lines[at(i - 1)]!.dir, lines[i]!.dir);

  // Agrupa las aristas en lados; el primero contiene la arista 0.
  let first = 0;
  for (let k = 0; k < n && joinsPrevious(first); k++) first = at(first - 1);
  const groups: number[][] = [];
  for (let k = 0; k < n; k++) {
    const i = at(first + k);
    if (k === 0 || !joinsPrevious(i)) groups.push([i]);
    else groups[groups.length - 1]!.push(i);
  }

  const corners = groups.map((group, g) => {
    const prev = lines[groups[at2(g - 1, groups.length)]!.at(-1)!]!;
    const curr = lines[group[0]!]!;
    return (
      intersectLines(prev.origin, prev.dir, curr.origin, curr.dir) ??
      add(curr.node, scale(perpLeft(curr.dir), curr.offset))
    );
  });

  const outline: Vec2[] = [];
  const sides = groups.map((group, g) => {
    outline.push(corners[g]!);
    for (let k = 1; k < group.length; k++) {
      const before = lines[group[k - 1]!]!;
      const line = lines[group[k]!]!;
      if (Math.abs(before.offset - line.offset) > 1e-9) {
        // Escalón: los tramos del lado tienen distinto espesor.
        outline.push(add(line.node, scale(perpLeft(line.dir), before.offset)));
        outline.push(add(line.node, scale(perpLeft(line.dir), line.offset)));
      }
    }
    const start = corners[g]!;
    const end = corners[at2(g + 1, groups.length)]!;
    const dir = lines[group[0]!]!.dir;
    return {
      index: g,
      edgeIndices: group,
      wallIds: group.flatMap((i) => (edges[i]?.wall ? [edges[i].wall.id] : [])),
      start,
      end,
      length: Math.abs(dot(sub(end, start), dir)),
    };
  });
  return { outline, sides };
}

/** Lados del recinto; el lado 0 es el que contiene la primera arista del contorno. */
export function roomSides(level: Level, room: Room): RoomSide[] {
  return roomInterior(level, room).sides;
}

/** Largos interiores de cada lado del recinto (mm). */
export function roomSideLengths(level: Level, room: Room): number[] {
  return roomSides(level, room).map((s) => s.length);
}

export interface WallSideLabel {
  /** Número de lado, desde 1. */
  readonly side: number;
  /** Tramo dentro del lado (desde 1) si el lado tiene varios muros. */
  readonly part?: number;
}

/** Ubicación de un muro dentro de los lados de un recinto («Lado 2» o «Lado 2.1»). */
export function wallSideLabel(level: Level, room: Room, wallId: string): WallSideLabel | null {
  for (const side of roomSides(level, room)) {
    const k = side.wallIds.indexOf(wallId);
    if (k < 0) continue;
    return side.wallIds.length > 1
      ? { side: side.index + 1, part: k + 1 }
      : { side: side.index + 1 };
  }
  return null;
}

export type WallFace = 'left' | 'right';

/** Cara del muro (según su dirección start → end) que mira al interior del recinto. */
export function wallFaceTowardRoom(level: Level, room: Room, wallId: string): WallFace | null {
  const edge = roomEdges(level, room).find((e) => e.wall?.id === wallId);
  if (!edge?.wall) return null;
  const forward = edge.wall.start === edge.from;
  const ccw = isCounterClockwise(roomCenterlinePolygon(level, room));
  return forward === ccw ? 'left' : 'right';
}

/** Recinto hacia el que mira una cara del muro, si lo hay. */
export function roomOnWallFace(level: Level, wallId: string, face: WallFace): Room | undefined {
  return roomsOfWall(level, wallId).find((r) => wallFaceTowardRoom(level, r, wallId) === face);
}

/**
 * Cómo da un muro al exterior, para el corte que solo recorta lo que tapa el interior:
 * `exterior` (una cara da a un recinto y la otra no; `outward` apunta hacia afuera), `interior`
 * (recintos de los dos lados) o `free` (muro suelto, sin recintos).
 */
export type WallExposure =
  | { readonly kind: 'exterior'; readonly mid: Vec2; readonly outward: Vec2 }
  | { readonly kind: 'interior' | 'free'; readonly mid: Vec2 };

export function levelWallExposure(level: Level): Map<string, WallExposure> {
  const positions = nodePositions(level);
  const out = new Map<string, WallExposure>();
  for (const wall of level.walls) {
    const a = requireNodePosition(positions, wall.start);
    const b = requireNodePosition(positions, wall.end);
    const mid = scale(add(a, b), 0.5);
    const left = roomOnWallFace(level, wall.id, 'left') !== undefined;
    const right = roomOnWallFace(level, wall.id, 'right') !== undefined;
    if (left === right) {
      out.set(wall.id, { kind: left ? 'interior' : 'free', mid });
      continue;
    }
    const normal = perpLeft(normalize(sub(b, a)));
    // La cara izquierda mira hacia perpLeft: si el recinto está a la izquierda, afuera es el otro lado.
    out.set(wall.id, { kind: 'exterior', mid, outward: left ? scale(normal, -1) : normal });
  }
  return out;
}
