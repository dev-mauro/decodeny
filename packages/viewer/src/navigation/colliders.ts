import {
  itemBase,
  itemEnvelope,
  resolveItemDefinition,
  resolveOpeningDefinition,
} from '@decodeny/catalog';
import {
  add,
  angleOf,
  distance,
  interiorPoint,
  itemFootprint,
  levelBounds,
  mmToMeters,
  pointInPolygon,
  openingEnvelope,
  roomInteriorPolygon,
  scale,
  sub,
  type Level,
  type Room,
  type Vec2,
  type Wall,
} from '@decodeny/domain';
import { planToWorld, type Vec3Tuple } from '../coords';

/** Caja de colisión orientada (metros, mundo). */
export interface BoxCollider {
  readonly position: Vec3Tuple;
  readonly halfExtents: Vec3Tuple;
  /** Rotación alrededor de Y (radianes). */
  readonly rotationY: number;
}

/** Tramo de muro (mm a lo largo del eje desde `start`) entre dos alturas. */
interface WallChunk {
  readonly from: number;
  readonly to: number;
  readonly bottom: number;
  readonly top: number;
}

/**
 * Tramos sólidos de un muro: el muro completo menos los vanos transitables (puertas), sobre
 * los que queda solo el dintel. Los extremos se prolongan medio espesor para cerrar esquinas.
 */
export function wallChunks(level: Level, wall: Wall, length: number): WallChunk[] {
  const half = wall.thickness / 2;
  const passages = level.openings
    .filter((o) => o.wallId === wall.id && resolveOpeningDefinition(o.def).passable)
    .map((o) => {
      const env = openingEnvelope(o);
      return {
        from: o.offset - env.width / 2,
        to: o.offset + env.width / 2,
        top: env.sill + env.height,
      };
    })
    .sort((a, b) => a.from - b.from);
  const chunks: WallChunk[] = [];
  let cursor = -half;
  for (const p of passages) {
    if (p.from > cursor) chunks.push({ from: cursor, to: p.from, bottom: 0, top: wall.height });
    if (p.top < wall.height)
      chunks.push({ from: p.from, to: p.to, bottom: p.top, top: wall.height });
    cursor = Math.max(cursor, p.to);
  }
  if (length + half > cursor) {
    chunks.push({ from: cursor, to: length + half, bottom: 0, top: wall.height });
  }
  return chunks;
}

/** Colisionadores de muros: una caja por tramo sólido, a lo largo del eje. */
export function wallColliders(level: Level): BoxCollider[] {
  const nodes = new Map(level.nodes.map((n) => [n.id, n]));
  const base = level.elevation;
  const boxes: BoxCollider[] = [];
  for (const wall of level.walls) {
    const a = nodes.get(wall.start);
    const b = nodes.get(wall.end);
    if (!a || !b) continue;
    const length = distance(a, b);
    if (length === 0) continue;
    const dir = scale(sub(b, a), 1 / length);
    // Un ángulo de planta antihorario es una rotación positiva en Y (norte = −Z).
    const rotationY = angleOf(dir);
    for (const chunk of wallChunks(level, wall, length)) {
      const mid = add(a, scale(dir, (chunk.from + chunk.to) / 2));
      boxes.push({
        position: planToWorld(mid, base + (chunk.bottom + chunk.top) / 2),
        halfExtents: [
          mmToMeters(chunk.to - chunk.from) / 2,
          mmToMeters(chunk.top - chunk.bottom) / 2,
          mmToMeters(wall.thickness) / 2,
        ],
        rotationY,
      });
    }
  }
  return boxes;
}

const GROUND_MARGIN_MM = 20_000;
const GROUND_THICKNESS = 0.1;

/** Suelo continuo bajo todo el nivel (y alrededor) para que la persona nunca caiga. */
export function groundCollider(level: Level): BoxCollider {
  const b = levelBounds(level) ?? { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  const center = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
  const [x, , z] = planToWorld(center);
  return {
    position: [x, mmToMeters(level.elevation) - GROUND_THICKNESS / 2, z],
    halfExtents: [
      mmToMeters(b.max.x - b.min.x + GROUND_MARGIN_MM) / 2,
      GROUND_THICKNESS / 2,
      mmToMeters(b.max.y - b.min.y + GROUND_MARGIN_MM) / 2,
    ],
    rotationY: 0,
  };
}

/** Punto de aparición: posición de los pies (mundo) y rumbo de la mirada. */
export interface SpawnPoint {
  readonly feet: Vec3Tuple;
  /** Rotación de la mirada alrededor de Y (radianes; 0 = mirando hacia −Z / norte). */
  readonly yaw: number;
}

/** Recinto que contiene un punto de planta (mm), si alguno. */
export function roomAt(level: Level, p: Vec2): Room | undefined {
  return level.rooms.find((room) => pointInPolygon(p, roomInteriorPolygon(level, room)));
}

/** Aparición dentro de un recinto, en su punto interior más holgado (lejos de los muebles). */
export function spawnInRoom(level: Level, room: Room, yaw = 0): SpawnPoint {
  const obstacles = level.items
    .filter((item) => resolveItemDefinition(item.def).solid !== false)
    .map((item) => itemFootprint(item, itemEnvelope(item)));
  const p = interiorPoint(roomInteriorPolygon(level, room), 24, obstacles);
  return { feet: planToWorld(p, level.elevation), yaw };
}

/** Colisionadores de muebles: su caja envolvente, girada como el mueble. */
export function itemColliders(level: Level): BoxCollider[] {
  return level.items
    .filter((item) => resolveItemDefinition(item.def).solid !== false)
    .map((item) => {
      const env = itemEnvelope(item);
      return {
        position: planToWorld(
          item.position,
          level.elevation + itemBase(level, item) + env.height / 2,
        ),
        halfExtents: [
          mmToMeters(env.width) / 2,
          mmToMeters(env.height) / 2,
          mmToMeters(env.depth) / 2,
        ],
        rotationY: (item.rotation * Math.PI) / 180,
      };
    });
}

/** Convierte una posición de mundo (m) a planta (mm). */
export const worldToPlan = (x: number, z: number): Vec2 => ({ x: x * 1000, y: -z * 1000 });
