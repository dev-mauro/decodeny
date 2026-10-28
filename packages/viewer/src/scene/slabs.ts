import { slabOpenings } from '@decodeny/catalog';
import {
  bounds,
  isCounterClockwise,
  levelWallFootprints,
  roomInteriorPolygon,
  type Bounds,
  type Level,
  type Vec2,
} from '@decodeny/domain';
import * as clippingModule from 'polygon-clipping';
import type { Polygon as ClipPolygon } from 'polygon-clipping';

// La versión ESM de la librería solo exporta un objeto por defecto (sus tipos, funciones sueltas).
const clipping =
  (clippingModule as unknown as { default?: typeof clippingModule }).default ?? clippingModule;

/** Región plana de la planta (mm): contorno antihorario y agujeros horarios. */
export interface PlanRegion {
  readonly outline: readonly Vec2[];
  readonly holes: readonly (readonly Vec2[])[];
}

/** Losa sobre la que está una planta (la apoya la de abajo). */
export interface SlabBelow {
  /** Superficie de la losa: los recintos y muros de la planta, menos los huecos. */
  readonly regions: readonly PlanRegion[];
  /** Espesor visible bajo el piso (mm): del cielo de la planta de abajo al piso de esta. */
  readonly depth: number;
}

/**
 * Lo que la losa entre plantas le hace a una planta (I12): los huecos de su piso (escaleras que
 * suben desde abajo), los de su cielo (sus propias escaleras) y la losa sobre la que está.
 */
export interface LevelSlab {
  readonly floorVoids: readonly (readonly Vec2[])[];
  readonly ceilingVoids: readonly (readonly Vec2[])[];
  /** `null` en la planta más baja: se apoya en el suelo. */
  readonly below: SlabBelow | null;
}

export const NO_VOIDS: readonly (readonly Vec2[])[] = [];

const ring = (polygon: readonly Vec2[]): [number, number][] => polygon.map((p) => [p.x, p.y]);

/** Anillo de salida de la librería (cerrado) a polígono, con la orientación pedida. */
function fromRing(points: readonly [number, number][], ccw: boolean): Vec2[] {
  const open = points.slice(0, -1).map(([x, y]) => ({ x, y }));
  return isCounterClockwise(open) === ccw ? open : open.reverse();
}

function toRegions(polygons: readonly ClipPolygon[]): PlanRegion[] {
  return polygons.map(([outer, ...holes]) => ({
    outline: fromRing(outer!, true),
    holes: holes.map((h) => fromRing(h, false)),
  }));
}

const overlaps = (a: Bounds, b: Bounds): boolean =>
  a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y;

/**
 * Un polígono menos unos huecos. Sin huecos que lo toquen, queda igual (sin pasar por la
 * librería); si la geometría es degenerada y la resta falla, también.
 */
export function subtractVoids(
  polygon: readonly Vec2[],
  voids: readonly (readonly Vec2[])[],
): PlanRegion[] {
  const box = bounds(polygon);
  const touching = voids.filter((v) => overlaps(box, bounds(v)));
  if (touching.length === 0) return [{ outline: polygon, holes: [] }];
  try {
    return toRegions(clipping.difference([ring(polygon)], ...touching.map((v) => [ring(v)])));
  } catch {
    return [{ outline: polygon, holes: [] }];
  }
}

/** Superficie de losa de una planta: sus recintos y muros unidos, menos los huecos. */
function slabRegions(level: Level, voids: readonly (readonly Vec2[])[]): PlanRegion[] {
  const pieces: ClipPolygon[] = [
    ...level.rooms.map((room) => [ring(roomInteriorPolygon(level, room))]),
    ...[...levelWallFootprints(level).values()].map((f) => [ring(f.polygon)]),
  ];
  if (pieces.length === 0) return [];
  try {
    const solid = clipping.union(pieces[0]!, ...pieces.slice(1));
    return toRegions(
      voids.length > 0 ? clipping.difference(solid, ...voids.map((v) => [ring(v)])) : solid,
    );
  } catch {
    return [];
  }
}

/** Losa de una planta entre todas las del proyecto (ordenadas de abajo hacia arriba). */
export function levelSlab(levels: readonly Level[], level: Level): LevelSlab {
  const index = levels.findIndex((l) => l.id === level.id);
  const below = index > 0 ? levels[index - 1] : undefined;
  const floorVoids = below ? slabOpenings(levels, level.id, 'floor') : NO_VOIDS;
  const ceilingVoids = slabOpenings(levels, level.id, 'ceiling');
  if (!below) return { floorVoids, ceilingVoids, below: null };
  const top = below.elevation + Math.max(0, ...below.walls.map((w) => w.height));
  return {
    floorVoids,
    ceilingVoids,
    below: { regions: slabRegions(level, floorVoids), depth: level.elevation - top },
  };
}

export const voidsKey = (voids: readonly (readonly Vec2[])[]): string =>
  voids.map((v) => v.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';')).join('|');
