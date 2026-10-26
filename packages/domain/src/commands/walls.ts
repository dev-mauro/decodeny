import { DomainError } from '../errors';
import { distance, type Vec2 } from '../geometry';
import { requireLevel, requireWall, roomEdges } from '../model/queries';
import { reconcileRooms, retireRoom } from '../model/room-detection';
import { WALL_LIMITS } from '../model/schema';
import { insertCrossingNodes, normalizeTopology } from '../model/topology';
import { defineCommand } from './command';
import { assertLevelGeometry, assertRange } from './validation';

export interface WallRef {
  readonly levelId: string;
  readonly wallId: string;
}

/** Largo mínimo de un muro dibujado (mm): permite tabiques y machones cortos. */
export const MIN_DRAWN_WALL_LENGTH = 10;

export interface RoomDetectionResult {
  /** Recintos creados o redefinidos por la detección. */
  readonly roomIds: readonly string[];
}

export interface AddWallArgs {
  readonly levelId: string;
  /** Extremos sobre el eje del muro (mm de planta). */
  readonly from: Vec2;
  readonly to: Vec2;
  /** Por omisión, los del proyecto. */
  readonly thickness?: number;
  readonly height?: number;
  /** Nombre base de los recintos que se cierren con este muro; sin él no se detectan recintos. */
  readonly roomName?: string;
}

/**
 * Agrega un muro suelto entre dos puntos. Se une al grafo existente: los extremos que caen sobre
 * un nodo o un muro se conectan (esquina o unión en T), y donde cruza otro muro se divide
 * (cruce en X). Si cierra uno o más contornos, se crean (o se dividen) los recintos.
 */
export const addWall = defineCommand<AddWallArgs, RoomDetectionResult>(
  'wall.add',
  (draft, args, ctx) => {
    const level = requireLevel(draft, args.levelId);
    const height = args.height ?? draft.settings.defaultWallHeight;
    const thickness = args.thickness ?? draft.settings.defaultWallThickness;
    assertRange('height', height, WALL_LIMITS.height.min, WALL_LIMITS.height.max);
    assertRange('thickness', thickness, WALL_LIMITS.thickness.min, WALL_LIMITS.thickness.max);
    const points = [args.from, args.to];
    if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      throw new DomainError('invalid-argument', 'Posición inválida', { field: 'position' });
    }
    const [a, b] = points.map((p) => ({
      id: ctx.ids('node'),
      x: Math.round(p.x),
      y: Math.round(p.y),
    }));
    assertRange('length', distance(a!, b!), MIN_DRAWN_WALL_LENGTH);
    const wall = {
      id: ctx.ids('wall'),
      start: a!.id,
      end: b!.id,
      thickness: Math.round(thickness),
      height: Math.round(height),
    };
    level.nodes.push(a!, b!);
    level.walls.push(wall);
    insertCrossingNodes(level, [wall.id], ctx.ids);
    normalizeTopology(level, ctx.ids);
    const roomIds =
      args.roomName !== undefined
        ? reconcileRooms(level, ctx.ids, { baseName: args.roomName })
        : [];
    assertLevelGeometry(level);
    return { roomIds };
  },
);

/**
 * Elimina un muro y sus vanos. Los recintos que lo usaban dejan de estar cerrados y se quitan
 * (sus muebles quedan); si al quitarlo se unen dos recintos, el resultante hereda los datos del
 * más grande.
 */
export const deleteWall = defineCommand<
  WallRef & { readonly roomName: string },
  RoomDetectionResult
>('wall.delete', (draft, args, ctx) => {
  const level = requireLevel(draft, args.levelId);
  requireWall(level, args.wallId);
  const affected = level.rooms.filter((room) =>
    roomEdges(level, room).some((e) => e.wall?.id === args.wallId),
  );
  const retired = affected.map((room) => retireRoom(level, room));
  level.rooms = level.rooms.filter((r) => !affected.includes(r));
  level.walls = level.walls.filter((w) => w.id !== args.wallId);
  level.openings = level.openings.filter((o) => o.wallId !== args.wallId);
  normalizeTopology(level, ctx.ids);
  const roomIds = reconcileRooms(level, ctx.ids, { baseName: args.roomName, retired });
  assertLevelGeometry(level);
  return { roomIds };
});

/** Crea recintos en los contornos cerrados de muros que todavía no son un recinto. */
export const detectRooms = defineCommand<
  { readonly levelId: string; readonly roomName: string },
  RoomDetectionResult
>('room.detect', (draft, args, ctx) => {
  const level = requireLevel(draft, args.levelId);
  const roomIds = reconcileRooms(level, ctx.ids, { baseName: args.roomName });
  assertLevelGeometry(level);
  return { roomIds };
});

export const setWallHeight = defineCommand<WallRef & { readonly height: number }>(
  'wall.setHeight',
  (draft, args) => {
    assertRange('height', args.height, WALL_LIMITS.height.min, WALL_LIMITS.height.max);
    const level = requireLevel(draft, args.levelId);
    requireWall(level, args.wallId).height = Math.round(args.height);
    assertLevelGeometry(level);
  },
);

/** Cambia el espesor manteniendo el eje: cada cara se desplaza la mitad del cambio. */
export const setWallThickness = defineCommand<WallRef & { readonly thickness: number }>(
  'wall.setThickness',
  (draft, args) => {
    assertRange('thickness', args.thickness, WALL_LIMITS.thickness.min, WALL_LIMITS.thickness.max);
    const level = requireLevel(draft, args.levelId);
    const wall = requireWall(level, args.wallId);
    wall.thickness = Math.round(args.thickness);
    assertLevelGeometry(level);
  },
);

/** Nombre propio del muro; vacío vuelve al nombre automático («Lado n»). */
export const renameWall = defineCommand<WallRef & { readonly name: string }>(
  'wall.rename',
  (draft, args) => {
    const wall = requireWall(requireLevel(draft, args.levelId), args.wallId);
    const name = args.name.trim().slice(0, 80);
    if (name === '') delete wall.name;
    else wall.name = name;
  },
);
