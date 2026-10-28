import {
  itemBase,
  itemEnvelope,
  resolveItemDefinition,
  resolveOpeningDefinition,
} from '@decodeny/catalog';
import {
  add,
  itemLocalToPlan,
  resolveParams,
  angleOf,
  distance,
  interiorPoint,
  itemFootprint,
  levelBounds,
  mmToMeters,
  pointInPolygon,
  openingEnvelope,
  roomEdges,
  roomInteriorPolygon,
  roomsOfWall,
  scale,
  sub,
  type Level,
  type Room,
  type Vec2,
  type Wall,
} from '@decodeny/domain';
import earcut from 'earcut';
import { planToWorld, type Vec3Tuple } from '../coords';
import type { SlabBelow } from '../scene/slabs';
import {
  cabinToPlan,
  GATE_HEIGHT,
  GATE_MM,
  gatedStops,
  PLATFORM_MM,
  type Elevator,
  type ElevatorState,
} from './elevators';
import type { ViewerSelection } from '../selection';

/** Caja de colisión orientada (metros, mundo). */
export interface BoxCollider {
  readonly position: Vec3Tuple;
  readonly halfExtents: Vec3Tuple;
  /** Rotación alrededor de Y (radianes). */
  readonly rotationY: number;
  /** Inclinación (rotación en x antes de la de Y): las rampas de las escaleras. */
  readonly pitch?: number;
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

/**
 * Suelo continuo bajo todo el nivel (y alrededor) para que la persona nunca caiga. Va bajo la
 * planta más baja; las de arriba se apoyan en su losa (`slabCollider`).
 */
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

/** Recinto habitable que contiene un punto de planta (mm), si alguno. */
export function roomAt(level: Level, p: Vec2): Room | undefined {
  return level.rooms.find(
    (room) => !room.uninhabitable && pointInPolygon(p, roomInteriorPolygon(level, room)),
  );
}

/**
 * Los espacios no habitables no se recorren: un cerco (caras verticales por su contorno
 * interior, del piso al cielo) tapa también sus puertas.
 */
export function closedRoomColliders(level: Level): TrimeshCollider | null {
  const vertices: number[] = [];
  const indices: number[] = [];
  const base = mmToMeters(level.elevation);
  for (const room of level.rooms) {
    if (!room.uninhabitable) continue;
    const top =
      base + mmToMeters(Math.max(...roomEdges(level, room).map((e) => e.wall?.height ?? 0)));
    const ring = roomInteriorPolygon(level, room);
    for (const [i, a] of ring.entries()) {
      const b = ring[(i + 1) % ring.length]!;
      const first = vertices.length / 3;
      for (const [p, y] of [
        [a, base],
        [b, base],
        [b, top],
        [a, top],
      ] as const) {
        vertices.push(mmToMeters(p.x), y, -mmToMeters(p.y));
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }
  if (indices.length === 0) return null;
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/** Aparición dentro de un recinto, en su punto interior más holgado (lejos de los muebles). */
export function spawnInRoom(level: Level, room: Room, yaw = 0): SpawnPoint {
  const obstacles = level.items
    .filter((item) => resolveItemDefinition(item.def).solid !== false)
    .map((item) => itemFootprint(item, itemEnvelope(item)));
  const p = interiorPoint(roomInteriorPolygon(level, room), 24, obstacles);
  return { feet: planToWorld(p, level.elevation), yaw };
}

/**
 * Colisionadores de muebles: su caja envolvente, girada como el mueble, o las cajas que declara
 * su definición (las rampas y barandas de una escalera).
 */
export function itemColliders(level: Level): BoxCollider[] {
  return level.items
    .filter((item) => resolveItemDefinition(item.def).solid !== false)
    .flatMap((item): BoxCollider[] => {
      const definition = resolveItemDefinition(item.def);
      const rotation = (item.rotation * Math.PI) / 180;
      if (definition.colliders) {
        const base = level.elevation + itemBase(level, item);
        return definition.colliders(resolveParams(definition.params, item.params)).map((c) => ({
          position: planToWorld(itemLocalToPlan(item, c.at[0], c.at[2]), base + c.at[1]),
          halfExtents: [
            mmToMeters(c.size[0]) / 2,
            mmToMeters(c.size[1]) / 2,
            mmToMeters(c.size[2]) / 2,
          ],
          rotationY: rotation + (c.rotationY ?? 0),
          ...(c.pitch ? { pitch: c.pitch } : {}),
        }));
      }
      const env = itemEnvelope(item);
      return [
        {
          position: planToWorld(
            item.position,
            level.elevation + itemBase(level, item) + env.height / 2,
          ),
          halfExtents: [
            mmToMeters(env.width) / 2,
            mmToMeters(env.height) / 2,
            mmToMeters(env.depth) / 2,
          ],
          rotationY: rotation,
        },
      ];
    });
}

/** Margen (mm) para dar por llegada una planta: los pies a esta distancia de su piso. */
const LEVEL_ARRIVAL_MM = 100;

/** Planta en la que está la persona: la más alta cuyo piso alcanzan sus pies (mm). */
export function levelAtFeet(levels: readonly Level[], feetMm: number): Level | undefined {
  return levels.findLast((l) => l.elevation - LEVEL_ARRIVAL_MM <= feetMm) ?? levels[0];
}

/** Malla de colisión (m, mundo): vértices xyz y triángulos. */
export interface TrimeshCollider {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

/**
 * Piso de una planta que no es la más baja: la cara de arriba de su losa (recintos y muros, sin
 * los huecos de escalera), para pararse en ella y caer por los huecos.
 */
export function slabCollider(level: Level, slab: SlabBelow): TrimeshCollider | null {
  const vertices: number[] = [];
  const indices: number[] = [];
  const y = mmToMeters(level.elevation);
  for (const region of slab.regions) {
    const rings = [region.outline, ...region.holes];
    const flat = rings.flatMap((ring) => ring.flatMap((p) => [p.x, p.y]));
    const holes: number[] = [];
    let count = region.outline.length;
    for (const hole of region.holes) {
      holes.push(count);
      count += hole.length;
    }
    const base = vertices.length / 3;
    for (let i = 0; i < flat.length; i += 2) {
      vertices.push(mmToMeters(flat[i]!), y, -mmToMeters(flat[i + 1]!));
    }
    for (const index of earcut(flat, holes, 2)) indices.push(base + index);
  }
  if (indices.length === 0) return null;
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/** Convierte una posición de mundo (m) a planta (mm). */
export const worldToPlan = (x: number, z: number): Vec2 => ({ x: x * 1000, y: -z * 1000 });

/**
 * Dónde aparece la persona al entrar al recorrido: en `start` (punto elegido en la planta) si
 * cae dentro de un recinto; si no, donde está la cámara si está dentro de uno; si no, en el
 * recinto seleccionado o en el primero.
 */
export function chooseSpawn(
  level: Level,
  selection: ViewerSelection | null,
  camera: { position: { x: number; z: number } },
  yaw: number,
  start: Vec2 | null = null,
): SpawnPoint {
  if (start && roomAt(level, start)) {
    const [x, , z] = planToWorld(start);
    return { feet: [x, level.elevation / 1000, z], yaw };
  }
  const plan = worldToPlan(camera.position.x, camera.position.z);
  if (roomAt(level, plan)) {
    return { feet: [camera.position.x, level.elevation / 1000, camera.position.z], yaw };
  }
  const selectedRoomId =
    selection?.kind === 'room'
      ? selection.id
      : selection
        ? roomsOfWall(level, selection.id)[0]?.id
        : undefined;
  const habitable = level.rooms.filter((r) => !r.uninhabitable);
  const room = habitable.find((r) => r.id === selectedRoomId) ?? habitable[0];
  if (room) return spawnInRoom(level, room, yaw);
  return { feet: [0, level.elevation / 1000, 0], yaw };
}

/**
 * Hojas cerradas de las puertas operables: una caja que tapa el vano (el muro ya deja libre
 * su paso, ver `wallChunks`). Abiertas o en movimiento no tienen colisión.
 */
export function closedDoorColliders(level: Level, closedIds: readonly string[]): BoxCollider[] {
  if (closedIds.length === 0) return [];
  const nodes = new Map(level.nodes.map((n) => [n.id, n]));
  const walls = new Map(level.walls.map((w) => [w.id, w]));
  const closed = new Set(closedIds);
  const boxes: BoxCollider[] = [];
  for (const opening of level.openings) {
    if (!closed.has(opening.id)) continue;
    const wall = walls.get(opening.wallId);
    const a = wall && nodes.get(wall.start);
    const b = wall && nodes.get(wall.end);
    if (!wall || !a || !b) continue;
    const length = distance(a, b);
    if (length === 0) continue;
    const dir = scale(sub(b, a), 1 / length);
    const env = openingEnvelope(opening);
    boxes.push({
      position: planToWorld(
        add(a, scale(dir, opening.offset)),
        level.elevation + env.sill + env.height / 2,
      ),
      halfExtents: [
        mmToMeters(env.width) / 2,
        mmToMeters(env.height) / 2,
        mmToMeters(wall.thickness) / 2,
      ],
      rotationY: angleOf(dir),
    });
  }
  return boxes;
}

/** Plataforma de un ascensor a una altura (mm sobre su planta): su cara de arriba es el piso. */
export function elevatorPlatformCollider(elevator: Elevator, offset: number): BoxCollider {
  const { x, z } = elevator.cabin;
  return {
    position: planToWorld(
      cabinToPlan(elevator, (x[0] + x[1]) / 2, (z[0] + z[1]) / 2),
      elevator.base + offset - PLATFORM_MM / 2,
    ),
    halfExtents: [
      mmToMeters(x[1] - x[0]) / 2,
      mmToMeters(PLATFORM_MM) / 2,
      mmToMeters(z[1] - z[0]) / 2,
    ],
    rotationY: (elevator.item.rotation * Math.PI) / 180,
  };
}

/** Rejas al frente de las paradas donde no está la plataforma (ver `gatedStops`). */
export function elevatorGateColliders(elevator: Elevator, state: ElevatorState): BoxCollider[] {
  const { x, z } = elevator.cabin;
  return gatedStops(elevator, state).map((stop) => ({
    position: planToWorld(
      cabinToPlan(elevator, (x[0] + x[1]) / 2, z[1] - GATE_MM / 2),
      elevator.base + stop.offset + GATE_HEIGHT / 2,
    ),
    halfExtents: [
      mmToMeters(x[1] - x[0]) / 2,
      mmToMeters(GATE_HEIGHT) / 2,
      mmToMeters(GATE_MM) / 2,
    ],
    rotationY: (elevator.item.rotation * Math.PI) / 180,
  }));
}
