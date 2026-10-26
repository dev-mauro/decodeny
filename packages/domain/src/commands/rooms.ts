import { DomainError } from '../errors';
import {
  add,
  distanceToSegment,
  isCounterClockwise,
  isSimplePolygon,
  normalize,
  offsetPolygon,
  roundVec,
  scale,
  sub,
  tracePath,
  type PathSegment,
  type Vec2,
} from '../geometry';
import {
  nodePositions,
  requireLevel,
  requireNodePosition,
  requireRoom,
  roomEdges,
  roomSides,
} from '../model/queries';
import { itemsInRoom } from '../model/items';
import { detachRoom, normalizeTopology, TOPOLOGY_TOLERANCE } from '../model/topology';
import { WALL_LIMITS } from '../model/schema';
import type { Level, Room } from '../model/types';
import { defineCommand, type CommandContext } from './command';
import { assertLevelGeometry, assertRange, assertRoomGeometry, MIN_ROOM_SIDE } from './validation';

interface WallSpec {
  readonly height: number;
  readonly thickness: number;
}

export interface CreatedRoom {
  readonly roomId: string;
}

function assertWallSpec(spec: WallSpec): void {
  assertRange('height', spec.height, WALL_LIMITS.height.min, WALL_LIMITS.height.max);
  assertRange('thickness', spec.thickness, WALL_LIMITS.thickness.min, WALL_LIMITS.thickness.max);
}

/**
 * Crea nodos, muros y recinto a partir del contorno **interior** (medidas útiles, que son las
 * que el usuario conoce). El eje de los muros queda a medio espesor hacia afuera.
 */
function createRoomFromInterior(
  level: Level,
  interior: readonly Vec2[],
  name: string,
  spec: WallSpec,
  ctx: CommandContext,
): CreatedRoom {
  assertWallSpec(spec);
  const ccw = isCounterClockwise(interior) ? [...interior] : [...interior].reverse();
  if (!isSimplePolygon(ccw)) {
    throw new DomainError('invalid-geometry', 'El contorno del recinto se cruza o colapsa');
  }
  const centerline = offsetPolygon(
    ccw,
    ccw.map(() => -spec.thickness / 2),
  ).map(roundVec);
  const nodes = centerline.map((p) => ({ id: ctx.ids('node'), x: p.x, y: p.y }));
  const walls = nodes.map((node, i) => ({
    id: ctx.ids('wall'),
    start: node.id,
    end: nodes[(i + 1) % nodes.length]!.id,
    thickness: spec.thickness,
    height: spec.height,
  }));
  const room: Room = { id: ctx.ids('room'), name, boundary: nodes.map((n) => n.id) };
  level.nodes.push(...nodes);
  level.walls.push(...walls);
  level.rooms.push(room);
  assertRoomGeometry(level, room);
  // Si el recinto queda adosado a otro (ejes coincidentes), comparten el muro.
  normalizeTopology(level, ctx.ids);
  assertLevelGeometry(level);
  return { roomId: room.id };
}

export interface CreateRectangularRoomArgs extends WallSpec {
  readonly levelId: string;
  readonly name: string;
  /** Esquina interior mínima (suroeste) en planta. */
  readonly origin: Vec2;
  /** Ancho interior (eje x). */
  readonly width: number;
  /** Largo interior (eje y). */
  readonly depth: number;
}

export const createRectangularRoom = defineCommand<CreateRectangularRoomArgs, CreatedRoom>(
  'room.createRectangular',
  (draft, args, ctx) => {
    assertRange('width', args.width, MIN_ROOM_SIDE);
    assertRange('depth', args.depth, MIN_ROOM_SIDE);
    const { x, y } = args.origin;
    const interior = [
      { x, y },
      { x: x + args.width, y },
      { x: x + args.width, y: y + args.depth },
      { x, y: y + args.depth },
    ];
    return createRoomFromInterior(
      requireLevel(draft, args.levelId),
      interior,
      args.name,
      args,
      ctx,
    );
  },
);

export interface CreateRoomFromPathArgs extends WallSpec {
  readonly levelId: string;
  readonly name: string;
  readonly origin: Vec2;
  /** Rumbo inicial en grados (0 = este). */
  readonly heading?: number;
  /** Recorrido de la cara interior; si no cierra, se cierra con un tramo recto. */
  readonly segments: readonly PathSegment[];
}

export const createRoomFromPath = defineCommand<CreateRoomFromPathArgs, CreatedRoom>(
  'room.createFromPath',
  (draft, args, ctx) => {
    args.segments.forEach((s, i) => assertRange(`segments.${i}.length`, s.length, MIN_ROOM_SIDE));
    const { points } = tracePath(args.segments, args.origin, args.heading ?? 0);
    if (points.length < 3) {
      throw new DomainError('invalid-geometry', 'Un recinto necesita al menos 3 lados');
    }
    return createRoomFromInterior(requireLevel(draft, args.levelId), points, args.name, args, ctx);
  },
);

export interface RoomRef {
  readonly levelId: string;
  readonly roomId: string;
}

export const renameRoom = defineCommand<RoomRef & { readonly name: string }>(
  'room.rename',
  (draft, args) => {
    const room = requireRoom(requireLevel(draft, args.levelId), args.roomId);
    room.name = args.name.trim().slice(0, 80);
  },
);

/** Elimina el recinto, sus muebles y los muros, vanos y nodos que solo él usaba. */
export const deleteRoom = defineCommand<RoomRef>('room.delete', (draft, args, ctx) => {
  const level = requireLevel(draft, args.levelId);
  const room = requireRoom(level, args.roomId);
  const furniture = new Set(itemsInRoom(level, room).map((i) => i.id));
  level.items = level.items.filter((i) => !furniture.has(i.id));
  const ownWalls = new Set(
    roomEdges(level, room)
      .map((e) => e.wall?.id)
      .filter((id): id is string => id !== undefined),
  );
  level.rooms = level.rooms.filter((r) => r.id !== room.id);
  for (const other of level.rooms) {
    for (const edge of roomEdges(level, other)) if (edge.wall) ownWalls.delete(edge.wall.id);
  }
  level.walls = level.walls.filter((w) => !ownWalls.has(w.id));
  level.openings = level.openings.filter((o) => !ownWalls.has(o.wallId));
  const usedNodes = new Set<string>();
  for (const w of level.walls) usedNodes.add(w.start).add(w.end);
  for (const r of level.rooms) r.boundary.forEach((id) => usedNodes.add(id));
  level.nodes = level.nodes.filter((n) => usedNodes.has(n.id));
  // Los vecinos recuperan sus muros enteros donde quedaron tramos divididos.
  normalizeTopology(level, ctx.ids);
});

/**
 * Traslada el recinto. Primero se independiza de sus vecinos (si se aleja, el muro compartido
 * queda con el vecino); al soltarlo, vuelve a compartir muros con quien quede adosado.
 */
export const moveRoom = defineCommand<RoomRef & { readonly dx: number; readonly dy: number }>(
  'room.move',
  (draft, args, ctx) => {
    const level = requireLevel(draft, args.levelId);
    const room = requireRoom(level, args.roomId);
    const dx = Math.round(args.dx);
    const dy = Math.round(args.dy);
    if (dx === 0 && dy === 0) return;
    // Los muebles del recinto se mueven con él.
    for (const item of itemsInRoom(level, room)) {
      item.position.x += dx;
      item.position.y += dy;
    }
    detachRoom(level, room, ctx.ids);
    const ids = new Set(room.boundary);
    for (const node of level.nodes) {
      if (ids.has(node.id)) {
        node.x += dx;
        node.y += dy;
      }
    }
    normalizeTopology(level, ctx.ids);
    assertLevelGeometry(level);
  },
);

/**
 * Nodos sobre la recta del lado `side` conectados a él por muros colineales: al empujar un
 * lado se mueve toda la línea de muro (p. ej. la fachada que continúa en el recinto vecino),
 * de modo que los recintos vecinos siguen siendo rectángulos.
 */
function nodesOnLine(level: Level, seeds: readonly string[], a: Vec2, b: Vec2): Set<string> {
  const positions = nodePositions(level);
  const dir = normalize(sub(b, a));
  const far = { x: a.x + dir.x * 1e7, y: a.y + dir.y * 1e7 };
  const near = { x: a.x - dir.x * 1e7, y: a.y - dir.y * 1e7 };
  const onLine = (id: string) => {
    const p = positions.get(id);
    return p !== undefined && distanceToSegment(p, near, far) <= TOPOLOGY_TOLERANCE;
  };
  const found = new Set(seeds);
  const queue = [...seeds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const wall of level.walls) {
      const other = wall.start === id ? wall.end : wall.end === id ? wall.start : null;
      if (other !== null && !found.has(other) && onLine(other)) {
        found.add(other);
        queue.push(other);
      }
    }
  }
  return found;
}

/**
 * Fija el largo **interior** de un lado del recinto empujando en paralelo el lado siguiente
 * (como "empujar el muro opuesto"): en un rectángulo, el recinto sigue siendo rectángulo.
 * Si el muro empujado es compartido, el recinto vecino se ajusta con él.
 */
export const setRoomSideLength = defineCommand<
  RoomRef & { readonly sideIndex: number; readonly length: number }
>('room.setSideLength', (draft, args, ctx) => {
  const level = requireLevel(draft, args.levelId);
  const room = requireRoom(level, args.roomId);
  const sides = roomSides(level, room);
  const side = sides[args.sideIndex];
  if (!Number.isInteger(args.sideIndex) || !side) {
    throw new DomainError('invalid-argument', 'Lado inexistente', { side: args.sideIndex });
  }
  assertRange('length', args.length, MIN_ROOM_SIDE);
  const delta = args.length - side.length;
  if (Math.abs(delta) < 0.5) return;

  const next = sides[(args.sideIndex + 1) % sides.length]!;
  const n = room.boundary.length;
  const seeds = [
    ...next.edgeIndices.map((i) => room.boundary[i]!),
    room.boundary[(next.edgeIndices[next.edgeIndices.length - 1]! + 1) % n]!,
  ];
  const positions = nodePositions(level);
  const moved = nodesOnLine(
    level,
    seeds,
    requireNodePosition(positions, seeds[0]!),
    requireNodePosition(positions, seeds[seeds.length - 1]!),
  );
  const shift = scale(normalize(sub(side.end, side.start)), delta);
  for (const node of level.nodes) {
    if (moved.has(node.id)) {
      const p = roundVec(add(node, shift));
      node.x = p.x;
      node.y = p.y;
    }
  }
  normalizeTopology(level, ctx.ids);
  assertLevelGeometry(level);
});

export const setRoomWallHeight = defineCommand<RoomRef & { readonly height: number }>(
  'room.setWallHeight',
  (draft, args) => {
    assertRange('height', args.height, WALL_LIMITS.height.min, WALL_LIMITS.height.max);
    const level = requireLevel(draft, args.levelId);
    const room = requireRoom(level, args.roomId);
    for (const edge of roomEdges(level, room)) {
      if (edge.wall) edge.wall.height = Math.round(args.height);
    }
    assertLevelGeometry(level);
  },
);

/**
 * Mueve un nodo (vértice del eje de muros) a una posición absoluta. Si es compartido, todos
 * los recintos que lo usan se ajustan; después se restablece la topología y se valida.
 */
export const moveNode = defineCommand<{
  readonly levelId: string;
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}>('node.move', (draft, args, ctx) => {
  const level = requireLevel(draft, args.levelId);
  const node = level.nodes.find((n) => n.id === args.nodeId);
  if (!node)
    throw new DomainError('not-found', `Nodo ${args.nodeId} no existe`, { id: args.nodeId });
  if (!Number.isFinite(args.x) || !Number.isFinite(args.y)) {
    throw new DomainError('invalid-argument', 'Posición inválida', { field: 'position' });
  }
  node.x = Math.round(args.x);
  node.y = Math.round(args.y);
  normalizeTopology(level, ctx.ids);
  assertLevelGeometry(level);
});
