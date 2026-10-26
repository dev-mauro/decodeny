import { cross, distance, distanceToSegment, dot, length, sub, type Vec2 } from '../geometry';
import type { IdFactory } from '../ids';
import { nodePositions, roomEdges } from './queries';
import type { Level, Room, Wall, WallFinish } from './types';

/**
 * Topología del grafo de muros de un nivel.
 *
 * Los recintos comparten muros cuando sus ejes coinciden: dos recintos adosados tienen **un**
 * tabique, no dos. `normalizeTopology` restablece esa invariante después de cualquier comando
 * que mueva nodos o cree recintos:
 *
 * 1. fusiona nodos coincidentes,
 * 2. divide un muro donde otro nodo cae sobre él (unión en T),
 * 3. fusiona muros duplicados (mismo par de nodos) en un muro compartido,
 * 4. vuelve a unir tramos colineales que quedaron sin uso (p. ej. tras separar un recinto).
 */

/** Distancia bajo la cual dos nodos se consideran el mismo, o un nodo cae sobre un muro (mm). */
export const TOPOLOGY_TOLERANCE = 2;

/** Tolerancia angular (seno del ángulo) para considerar dos direcciones colineales. */
const COLLINEAR_SIN = 1e-4;

export function normalizeTopology(level: Level, ids: IdFactory): void {
  mergeCoincidentNodes(level);
  splitWallsAtNodes(level, ids);
  mergeDuplicateWalls(level);
  mergeCollinearWalls(level);
  pruneUnusedNodes(level);
}

/**
 * Independiza un recinto de sus vecinos: duplica los nodos y muros que comparte, de modo que
 * pueda moverse sin arrastrar a los demás. Los vanos de un muro compartido quedan en el vecino.
 */
export function detachRoom(level: Level, room: Room, ids: IdFactory): void {
  const edges = roomEdges(level, room);
  const ownWallIds = new Set(edges.flatMap((e) => (e.wall ? [e.wall.id] : [])));
  const usedElsewhere = new Set<string>();
  const wallsOfOthers = new Set<string>();
  for (const other of level.rooms) {
    if (other.id === room.id) continue;
    other.boundary.forEach((id) => usedElsewhere.add(id));
    for (const e of roomEdges(level, other)) if (e.wall) wallsOfOthers.add(e.wall.id);
  }
  for (const wall of level.walls) {
    if (!ownWallIds.has(wall.id) || wallsOfOthers.has(wall.id)) {
      usedElsewhere.add(wall.start).add(wall.end);
    }
  }

  const remap = new Map<string, string>();
  for (const nodeId of new Set(room.boundary)) {
    if (!usedElsewhere.has(nodeId)) continue;
    const node = level.nodes.find((n) => n.id === nodeId)!;
    const copy = { id: ids('node'), x: node.x, y: node.y };
    level.nodes.push(copy);
    remap.set(nodeId, copy.id);
  }
  const mapNode = (id: string) => remap.get(id) ?? id;

  for (const edge of edges) {
    const wall = edge.wall;
    if (!wall) continue;
    if (wallsOfOthers.has(wall.id)) {
      level.walls.push({
        ...cloneWall(wall),
        id: ids('wall'),
        start: mapNode(wall.start),
        end: mapNode(wall.end),
      });
    } else {
      wall.start = mapNode(wall.start);
      wall.end = mapNode(wall.end);
    }
  }
  room.boundary = room.boundary.map(mapNode);
}

/**
 * Agrega un nodo donde los muros `wallIds` cruzan a otros muros (cruce en X), para que
 * `normalizeTopology` los divida ahí y el grafo siga siendo plano.
 */
export function insertCrossingNodes(
  level: Level,
  wallIds: readonly string[],
  ids: IdFactory,
): void {
  const positions = nodePositions(level);
  const segmentOf = (wall: Wall) => {
    const a = positions.get(wall.start);
    const b = positions.get(wall.end);
    return a && b ? { a, b } : null;
  };
  const targets = new Set(wallIds);
  const crossings: Vec2[] = [];
  for (const wall of level.walls) {
    if (!targets.has(wall.id)) continue;
    const s = segmentOf(wall);
    if (!s) continue;
    for (const other of level.walls) {
      if (other.id === wall.id || (targets.has(other.id) && other.id < wall.id)) continue;
      const o = segmentOf(other);
      if (!o) continue;
      const p = properCrossing(s.a, s.b, o.a, o.b);
      if (p && !crossings.some((q) => distance(p, q) <= TOPOLOGY_TOLERANCE)) crossings.push(p);
    }
  }
  for (const p of crossings) level.nodes.push({ id: ids('node'), x: p.x, y: p.y });
}

/** Punto (redondeado a mm) donde se cruzan los interiores de dos segmentos, si se cruzan. */
export function properCrossing(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const d = sub(a2, a1);
  const e = sub(b2, b1);
  const denom = cross(d, e);
  if (Math.abs(denom) < COLLINEAR_SIN * length(d) * length(e)) return null;
  const t = cross(sub(b1, a1), e) / denom;
  const u = cross(sub(b1, a1), d) / denom;
  const ta = TOPOLOGY_TOLERANCE / length(d);
  const tb = TOPOLOGY_TOLERANCE / length(e);
  if (t <= ta || t >= 1 - ta || u <= tb || u >= 1 - tb) return null;
  return { x: Math.round(a1.x + d.x * t), y: Math.round(a1.y + d.y * t) };
}

function cloneWall(wall: Wall): Wall {
  const { finish, ...rest } = wall;
  return finish ? { ...rest, finish: { ...finish } } : { ...rest };
}

// ---------------------------------------------------------------------------------------------

function mergeCoincidentNodes(level: Level): void {
  const remap = new Map<string, string>();
  const kept: { id: string; p: Vec2 }[] = [];
  for (const node of level.nodes) {
    const twin = kept.find((k) => distance(k.p, node) <= TOPOLOGY_TOLERANCE);
    if (twin) remap.set(node.id, twin.id);
    else kept.push({ id: node.id, p: node });
  }
  if (remap.size === 0) return;
  const mapNode = (id: string) => remap.get(id) ?? id;

  level.nodes = level.nodes.filter((n) => !remap.has(n.id));
  for (const wall of level.walls) {
    wall.start = mapNode(wall.start);
    wall.end = mapNode(wall.end);
  }
  const degenerate = new Set(level.walls.filter((w) => w.start === w.end).map((w) => w.id));
  level.walls = level.walls.filter((w) => !degenerate.has(w.id));
  level.openings = level.openings.filter((o) => !degenerate.has(o.wallId));
  for (const room of level.rooms) room.boundary = dedupeCycle(room.boundary.map(mapNode));
}

/** Quita nodos consecutivos repetidos (incluido el cierre del ciclo). */
function dedupeCycle(ids: readonly string[]): string[] {
  const out = ids.filter((id, i) => id !== ids[(i - 1 + ids.length) % ids.length]);
  return out.length > 0 ? out : ids.slice(0, 1);
}

function splitWallsAtNodes(level: Level, ids: IdFactory): void {
  const positions = nodePositions(level);
  /** `start|end` del muro original → cadena de nodos de start a end. */
  const chains = new Map<string, string[]>();
  const created: Wall[] = [];

  for (const wall of level.walls) {
    const a = positions.get(wall.start);
    const b = positions.get(wall.end);
    if (!a || !b) continue;
    const ab = sub(b, a);
    const len = length(ab);
    if (len <= 2 * TOPOLOGY_TOLERANCE) continue;
    const inner: { t: number; id: string }[] = [];
    for (const [id, p] of positions) {
      if (id === wall.start || id === wall.end) continue;
      if (distanceToSegment(p, a, b) > TOPOLOGY_TOLERANCE) continue;
      const along = dot(sub(p, a), ab) / len;
      if (along <= TOPOLOGY_TOLERANCE || along >= len - TOPOLOGY_TOLERANCE) continue;
      inner.push({ t: along, id });
    }
    if (inner.length === 0) continue;
    inner.sort((x, y) => x.t - y.t);

    const chain = [wall.start, ...inner.map((n) => n.id), wall.end];
    chains.set(`${wall.start}|${wall.end}`, chain);
    const stops = [0, ...inner.map((n) => n.t), len];
    const segmentIds = chain.slice(0, -1).map((_, i) => (i === 0 ? wall.id : ids('wall')));

    for (const opening of level.openings) {
      if (opening.wallId !== wall.id) continue;
      const i = Math.max(
        0,
        stops.findIndex((_, k) => k < stops.length - 1 && opening.offset < stops[k + 1]!),
      );
      opening.wallId = segmentIds[i]!;
      opening.offset = Math.round(opening.offset - stops[i]!);
    }
    for (let i = 1; i < chain.length - 1; i++) {
      created.push({
        ...cloneWall(wall),
        id: segmentIds[i]!,
        start: chain[i]!,
        end: chain[i + 1]!,
      });
    }
    wall.end = chain[1]!;
  }
  if (chains.size === 0) return;
  level.walls.push(...created);

  for (const room of level.rooms) {
    const next: string[] = [];
    room.boundary.forEach((u, i) => {
      const v = room.boundary[(i + 1) % room.boundary.length]!;
      next.push(u);
      const forward = chains.get(`${u}|${v}`);
      const backward = chains.get(`${v}|${u}`);
      if (forward) next.push(...forward.slice(1, -1));
      else if (backward) next.push(...backward.slice(1, -1).reverse());
    });
    room.boundary = next;
  }
}

function swapFinish(finish: WallFinish | undefined): WallFinish | undefined {
  if (!finish) return undefined;
  return {
    ...(finish.right !== undefined ? { left: finish.right } : {}),
    ...(finish.left !== undefined ? { right: finish.left } : {}),
  };
}

function mergeDuplicateWalls(level: Level): void {
  const positions = nodePositions(level);
  const byPair = new Map<string, Wall>();
  const removed = new Set<string>();
  for (const wall of level.walls) {
    const key = [wall.start, wall.end].sort().join('|');
    const kept = byPair.get(key);
    if (!kept) {
      byPair.set(key, wall);
      continue;
    }
    const reversed = kept.start !== wall.start;
    const other = reversed ? swapFinish(wall.finish) : wall.finish;
    const left = kept.finish?.left ?? other?.left;
    const right = kept.finish?.right ?? other?.right;
    if (left !== undefined || right !== undefined) {
      kept.finish = {
        ...(left !== undefined ? { left } : {}),
        ...(right !== undefined ? { right } : {}),
      };
    }
    if (kept.name === undefined && wall.name !== undefined) kept.name = wall.name;
    const len = distance(positions.get(wall.start)!, positions.get(wall.end)!);
    for (const opening of level.openings) {
      if (opening.wallId !== wall.id) continue;
      opening.wallId = kept.id;
      if (reversed) opening.offset = Math.round(len - opening.offset);
    }
    removed.add(wall.id);
  }
  if (removed.size > 0) level.walls = level.walls.filter((w) => !removed.has(w.id));
}

const sameFinish = (a: WallFinish | undefined, b: WallFinish | undefined): boolean =>
  a?.left === b?.left && a?.right === b?.right;

/** Orienta un muro para que empiece en `from` (invierte caras y vanos si hace falta). */
function orientFrom(level: Level, wall: Wall, from: string, len: number): void {
  if (wall.start === from) return;
  [wall.start, wall.end] = [wall.end, wall.start];
  const finish = swapFinish(wall.finish);
  if (finish) wall.finish = finish;
  else delete wall.finish;
  for (const o of level.openings) if (o.wallId === wall.id) o.offset = Math.round(len - o.offset);
}

/**
 * Une dos muros colineales que se encuentran en un nodo de grado 2 si son equivalentes
 * (espesor, altura, nombre y terminaciones): deshace las divisiones que ya no hacen falta.
 */
function mergeCollinearWalls(level: Level): void {
  for (let changed = true; changed;) {
    changed = false;
    const positions = nodePositions(level);
    const incident = new Map<string, Wall[]>();
    for (const wall of level.walls) {
      for (const id of [wall.start, wall.end]) {
        const list = incident.get(id);
        if (list) list.push(wall);
        else incident.set(id, [wall]);
      }
    }
    for (const [nodeId, walls] of incident) {
      if (walls.length !== 2) continue;
      const [w1, w2] = walls as [Wall, Wall];
      const a = w1.start === nodeId ? w1.end : w1.start;
      const b = w2.start === nodeId ? w2.end : w2.start;
      if (a === b) continue;
      const pa = positions.get(a)!;
      const pn = positions.get(nodeId)!;
      const pb = positions.get(b)!;
      const d1 = sub(pn, pa);
      const d2 = sub(pb, pn);
      const l1 = length(d1);
      const l2 = length(d2);
      if (Math.abs(cross(d1, d2)) > COLLINEAR_SIN * l1 * l2 || dot(d1, d2) <= 0) continue;
      if (w1.thickness !== w2.thickness || w1.height !== w2.height || w1.name !== w2.name) continue;
      const finish1 = w1.start === a ? w1.finish : swapFinish(w1.finish);
      const finish2 = w2.start === nodeId ? w2.finish : swapFinish(w2.finish);
      if (!sameFinish(finish1, finish2)) continue;

      orientFrom(level, w1, a, l1);
      orientFrom(level, w2, nodeId, l2);
      for (const o of level.openings) {
        if (o.wallId === w2.id) {
          o.wallId = w1.id;
          o.offset = Math.round(o.offset + l1);
        }
      }
      w1.end = b;
      level.walls = level.walls.filter((w) => w.id !== w2.id);
      for (const room of level.rooms) room.boundary = room.boundary.filter((id) => id !== nodeId);
      level.nodes = level.nodes.filter((n) => n.id !== nodeId);
      changed = true;
      break;
    }
  }
}

function pruneUnusedNodes(level: Level): void {
  const used = new Set<string>();
  for (const w of level.walls) used.add(w.start).add(w.end);
  for (const r of level.rooms) r.boundary.forEach((id) => used.add(id));
  if (used.size !== level.nodes.length) level.nodes = level.nodes.filter((n) => used.has(n.id));
}
