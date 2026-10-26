import { current, isDraft } from 'immer';
import { DomainError } from '../errors';
import {
  add,
  angleOf,
  distance,
  dot,
  interiorPoint,
  isSimplePolygon,
  pointInPolygon,
  polygonArea,
  roundVec,
  scale,
  signedArea,
  sub,
  type Vec2,
} from '../geometry';
import type { IdFactory } from '../ids';
import { assertRoomGeometry } from '../commands/validation';
import { openingEnvelope } from '../catalog/opening-definition';
import { nodePositions, roomCenterlinePolygon, wallBetween } from './queries';
import { normalizeTopology, properCrossing, TOPOLOGY_TOLERANCE } from './topology';
import type { Level, Room, Wall } from './types';

/**
 * Detección de recintos a partir del grafo de muros: cada cara acotada mínima del grafo planar
 * (un ciclo de muros sin muros dentro que lo dividan) es un recinto posible.
 */

/**
 * Ciclos mínimos (caras acotadas) del grafo de muros del nivel, como listas de nodos en sentido
 * antihorario. Los muros sueltos (que no cierran nada) se ignoran. Supone un grafo plano: los
 * cruces entre muros ya tienen un nodo (ver `addWall`).
 */
export function findWallCycles(level: Level): string[][] {
  const positions = nodePositions(level);
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const wall of level.walls) {
    if (wall.start === wall.end || !positions.has(wall.start) || !positions.has(wall.end)) continue;
    link(wall.start, wall.end);
    link(wall.end, wall.start);
  }

  // Poda de filamentos: un nodo con un solo muro no puede cerrar una cara.
  const queue = [...adjacency.keys()].filter((id) => adjacency.get(id)!.size <= 1);
  while (queue.length > 0) {
    const id = queue.pop()!;
    const neighbors = adjacency.get(id);
    if (!neighbors) continue;
    adjacency.delete(id);
    for (const other of neighbors) {
      const set = adjacency.get(other);
      if (!set) continue;
      set.delete(id);
      if (set.size <= 1) queue.push(other);
    }
  }

  // Vecinos de cada nodo ordenados por ángulo (antihorario).
  const sorted = new Map<string, string[]>();
  for (const [id, neighbors] of adjacency) {
    const p = positions.get(id)!;
    sorted.set(
      id,
      [...neighbors].sort(
        (a, b) => angleOf(sub(positions.get(a)!, p)) - angleOf(sub(positions.get(b)!, p)),
      ),
    );
  }

  // Recorrido de caras: desde u→v se sigue por el muro más a la izquierda en v, es decir, el
  // primero en sentido horario a partir de v→u. Así cada cara queda a la izquierda del recorrido.
  const visited = new Set<string>();
  const cycles: string[][] = [];
  for (const [start, neighbors] of sorted) {
    for (const first of neighbors) {
      if (visited.has(`${start}>${first}`)) continue;
      const cycle: string[] = [];
      let u = start;
      let v = first;
      let closed = false;
      for (let guard = 0; guard <= level.walls.length * 2; guard++) {
        visited.add(`${u}>${v}`);
        cycle.push(u);
        const around = sorted.get(v)!;
        const i = around.indexOf(u);
        const w = around[(i - 1 + around.length) % around.length]!;
        u = v;
        v = w;
        if (u === start && v === first) {
          closed = true;
          break;
        }
      }
      if (!closed || new Set(cycle).size !== cycle.length) continue;
      const polygon = cycle.map((id) => positions.get(id)!);
      // La cara exterior (y el contorno de islas) se recorre en sentido horario.
      if (signedArea(polygon) <= 0 || !isSimplePolygon(polygon)) continue;
      cycles.push(cycle);
    }
  }
  return cycles;
}

/** Recinto que se quitó (p. ej. al borrar un muro) y cuyos datos puede heredar una cara nueva. */
export interface RetiredRoom {
  readonly room: Room;
  readonly area: number;
  /** Punto interior del recinto quitado. */
  readonly point: Vec2;
}

export function retireRoom(level: Level, room: Room): RetiredRoom {
  const polygon = roomCenterlinePolygon(level, room);
  return { room, area: polygonArea(polygon), point: interiorPoint(polygon, 16) };
}

/** Recinto del que una cara nueva hereda id, nombre y terminaciones. */
interface FaceSource {
  readonly room: Room;
  /** `true` si la cara divide un recinto existente (que se reemplaza). */
  readonly replaces: boolean;
}

export interface ReconcileOptions {
  /** Nombre base de los recintos nuevos sin antecesor: «Recinto 1», «Recinto 2»… */
  readonly baseName: string;
  readonly retired?: readonly RetiredRoom[];
}

const cycleKey = (ids: readonly string[]) => [...ids].sort().join('|');

interface Face {
  readonly cycle: string[];
  readonly polygon: Vec2[];
  readonly area: number;
  readonly point: Vec2;
}

/** Caras del grafo que todavía no son un recinto y que serían un recinto válido. */
function candidateFaces(level: Level): Face[] {
  const positions = nodePositions(level);
  const known = new Set(level.rooms.map((r) => cycleKey(r.boundary)));
  return findWallCycles(level)
    .filter((cycle) => !known.has(cycleKey(cycle)))
    .map((cycle) => {
      const polygon = cycle.map((id) => positions.get(id)!);
      return { cycle, area: polygonArea(polygon), polygon, point: interiorPoint(polygon, 16) };
    })
    .filter((face) => {
      try {
        assertRoomGeometry(level, { id: 'candidate', name: '', boundary: face.cycle });
        return true;
      } catch (error) {
        if (error instanceof DomainError) return false;
        throw error;
      }
    });
}

// --- Muros que se tocan cara a cara -----------------------------------------------------------

/** Holgura (mm) para considerar que la huella de un nodo toca la de otro muro. */
const TOUCH_TOLERANCE = 5;
/** Nombre que marca los puentes de prueba (nunca llega al documento). */
const BRIDGE_MARK = '\u0000bridge:';

/**
 * Puente posible: un tramo corto desde un nodo hasta el eje de un muro cuya huella toca (dos
 * recintos con muros dobles, o un muro dibujado que termina contra la cara de otro). Queda
 * dentro del muro macizo, así que no cambia lo que se ve; solo conecta el grafo.
 */
interface Bridge {
  readonly nodeId: string;
  readonly point: Vec2;
  readonly thickness: number;
  readonly height: number;
}

/** ¿Cae `along` (mm desde el inicio del muro) dentro de un vano? Dividir ahí lo rompería. */
function insideOpening(level: Level, wallId: string, along: number): boolean {
  return level.openings.some((o) => {
    if (o.wallId !== wallId) return false;
    const half = openingEnvelope(o).width / 2;
    return (
      along > o.offset - half - TOPOLOGY_TOLERANCE && along < o.offset + half + TOPOLOGY_TOLERANCE
    );
  });
}

function bridgeCandidates(level: Level): Bridge[] {
  const positions = nodePositions(level);
  const incident = new Map<string, Wall[]>();
  for (const wall of level.walls) {
    for (const id of [wall.start, wall.end]) incident.set(id, [...(incident.get(id) ?? []), wall]);
  }
  const segments = level.walls.flatMap((wall) => {
    const a = positions.get(wall.start);
    const b = positions.get(wall.end);
    return a && b && distance(a, b) > 0 ? [{ wall, a, b }] : [];
  });

  const bridges: Bridge[] = [];
  for (const [nodeId, own] of incident) {
    const p = positions.get(nodeId);
    if (!p) continue;
    const reach = Math.max(...own.map((w) => w.thickness)) / 2;
    for (const { wall, a, b } of segments) {
      if (wall.start === nodeId || wall.end === nodeId) continue;
      const ab = sub(b, a);
      const len = Math.hypot(ab.x, ab.y);
      const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (len * len)));
      const q = add(a, scale(ab, t));
      const d = distance(p, q);
      if (d <= TOPOLOGY_TOLERANCE || d > reach + wall.thickness / 2 + TOUCH_TOLERANCE) continue;
      const end = t === 0 ? wall.start : t === 1 ? wall.end : null;
      if (end !== null && wallBetween(level, nodeId, end)) continue;
      if (end === null && insideOpening(level, wall.id, t * len)) continue;
      const crosses = segments.some(
        (s) => s.wall !== wall && !own.includes(s.wall) && properCrossing(p, q, s.a, s.b),
      );
      if (crosses) continue;
      bridges.push({
        nodeId,
        point: roundVec(q),
        thickness: Math.min(wall.thickness, ...own.map((w) => w.thickness)),
        height: Math.min(wall.height, ...own.map((w) => w.height)),
      });
    }
  }
  return bridges;
}

function addBridges(
  level: Level,
  bridges: readonly Bridge[],
  ids: IdFactory,
  mark: (index: number) => string | undefined,
): void {
  bridges.forEach((bridge, i) => {
    const node = { id: ids('node'), x: bridge.point.x, y: bridge.point.y };
    const name = mark(i);
    level.nodes.push(node);
    level.walls.push({
      id: ids('wall'),
      start: bridge.nodeId,
      end: node.id,
      thickness: bridge.thickness,
      height: bridge.height,
      ...(name !== undefined ? { name } : {}),
    });
  });
}

/**
 * Conecta los muros que se tocan cara a cara cuando eso cierra un recinto nuevo: se prueban
 * todos los puentes posibles en una copia del nivel y se agregan al nivel solo los que forman
 * parte de una cara válida. Así un contorno que se ve cerrado se reconoce aunque sus muros no
 * compartan eje (p. ej. recintos con muros dobles).
 */
function connectTouchingWalls(level: Level, ids: IdFactory): void {
  const bridges = bridgeCandidates(level);
  if (bridges.length === 0) return;
  const trial = structuredClone(isDraft(level) ? current(level) : level);
  let n = 0;
  const trialIds: IdFactory = (prefix) => `${prefix}_bridge${n++}`;
  // El nombre propio evita que la normalización una un puente con un muro colineal.
  addBridges(trial, bridges, trialIds, (i) => `${BRIDGE_MARK}${i}`);
  normalizeTopology(trial, trialIds);

  const used = new Set<number>();
  for (const face of candidateFaces(trial)) {
    face.cycle.forEach((u, i) => {
      const name = wallBetween(trial, u, face.cycle[(i + 1) % face.cycle.length]!)?.name;
      if (name?.startsWith(BRIDGE_MARK)) used.add(Number(name.slice(BRIDGE_MARK.length)));
    });
  }
  if (used.size === 0) return;
  addBridges(
    level,
    bridges.filter((_, i) => used.has(i)),
    ids,
    () => undefined,
  );
  normalizeTopology(level, ids);
}

/**
 * Sincroniza los recintos con las caras del grafo de muros:
 *
 * - una cara que ya es un recinto se deja como está;
 * - las caras dentro de un recinto existente (un muro nuevo lo dividió) lo reemplazan: la más
 *   grande conserva su id, nombre y terminaciones; las demás, sus terminaciones y un nombre nuevo;
 * - una cara que contiene a un recinto retirado (se borró el muro que los separaba) hereda sus
 *   datos;
 * - el resto son recintos nuevos.
 *
 * Los muros que se tocan cara a cara sin compartir eje se conectan si eso cierra un recinto
 * (ver `connectTouchingWalls`). Las caras que no serían un recinto válido (lados demasiado
 * cortos, interior que colapsa) se omiten. Devuelve los ids de los recintos creados o
 * reemplazados.
 */
export function reconcileRooms(level: Level, ids: IdFactory, options: ReconcileOptions): string[] {
  connectTouchingWalls(level, ids);
  const faces = candidateFaces(level);
  if (faces.length === 0) return [];

  const existing = level.rooms.map((room) => {
    const polygon = roomCenterlinePolygon(level, room);
    return { room, polygon, area: polygonArea(polygon) };
  });
  const retired = options.retired ?? [];

  const groups = new Map<string, { source: FaceSource | null; faces: Face[] }>();
  for (const face of faces) {
    const container = existing
      .filter((e) => pointInPolygon(face.point, e.polygon))
      .sort((a, b) => a.area - b.area)[0];
    const ancestor = retired
      .filter((r) => pointInPolygon(r.point, face.polygon))
      .sort((a, b) => b.area - a.area)[0];
    const source: FaceSource | null = container
      ? { room: container.room, replaces: true }
      : ancestor
        ? { room: ancestor.room, replaces: false }
        : null;
    const key = source ? source.room.id : `new:${groups.size}`;
    const group = groups.get(key) ?? { source, faces: [] };
    group.faces.push(face);
    groups.set(key, group);
  }

  const names = new Set(level.rooms.map((r) => r.name));
  let counter = 1;
  const freshName = () => {
    while (names.has(`${options.baseName} ${counter}`)) counter++;
    const name = `${options.baseName} ${counter}`;
    names.add(name);
    return name;
  };

  const created: string[] = [];
  for (const { source, faces: group } of groups.values()) {
    group.sort((a, b) => b.area - a.area);
    if (source?.replaces) level.rooms = level.rooms.filter((r) => r.id !== source.room.id);
    group.forEach((face, i) => {
      const room: Room = {
        id: source && i === 0 ? source.room.id : ids('room'),
        name: source && i === 0 ? source.room.name : freshName(),
        boundary: face.cycle,
        ...(source?.room.floor !== undefined ? { floor: source.room.floor } : {}),
        ...(source?.room.ceiling !== undefined ? { ceiling: source.room.ceiling } : {}),
      };
      names.add(room.name);
      level.rooms.push(room);
      created.push(room.id);
    });
  }
  return created;
}
