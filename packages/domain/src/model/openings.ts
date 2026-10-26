import { openingEnvelope } from '../catalog/opening-definition';
import { DomainError } from '../errors';
import { dot, sub, type WallFootprint } from '../geometry';
import { levelWallFootprints, requireWall, type WallFace } from './queries';
import type { Level, Opening } from './types';

/** Ancho y alto mínimos de un vano (mm). */
export const MIN_OPENING_SIZE = 100;
/** Dintel mínimo sobre un vano (mm): el vano no puede cortar la cara superior del muro. */
export const MIN_OPENING_HEADER = 20;

/** Intervalo a lo largo del eje del muro, medido desde su nodo `start` (mm). */
export interface AxisSpan {
  readonly start: number;
  readonly end: number;
}

const along = (fp: WallFootprint, p: { x: number; y: number }) => dot(sub(p, fp.start), fp.dir);

/** Tramo del eje donde existen ambas caras del muro (fuera de las esquinas): ahí cabe un vano. */
export function wallUsableSpan(fp: WallFootprint): AxisSpan {
  return {
    start: Math.max(along(fp, fp.startShape.left), along(fp, fp.startShape.right)),
    end: Math.min(along(fp, fp.endShape.left), along(fp, fp.endShape.right)),
  };
}

/** Tramo del eje que ocupa una cara del muro (su largo visible desde ese lado). */
export function wallFaceSpan(fp: WallFootprint, face: WallFace): AxisSpan {
  return { start: along(fp, fp.startShape[face]), end: along(fp, fp.endShape[face]) };
}

export function openingSpan(opening: Pick<Opening, 'offset' | 'params'>): AxisSpan {
  const { width } = openingEnvelope(opening);
  return { start: opening.offset - width / 2, end: opening.offset + width / 2 };
}

const TOLERANCE = 0.5;

function conflict(reason: 'height' | 'wall' | 'overlap', opening: Opening): DomainError {
  return new DomainError('opening-conflict', 'El vano no cabe en el muro', {
    reason,
    opening: opening.id,
  });
}

/** Verifica que el vano cabe en su muro: alto, largo útil y sin superponerse a otros vanos. */
export function assertOpeningFits(
  level: Level,
  opening: Opening,
  footprints: ReadonlyMap<string, WallFootprint> = levelWallFootprints(level),
): void {
  const wall = requireWall(level, opening.wallId);
  const env = openingEnvelope(opening);
  if (env.width < MIN_OPENING_SIZE || env.height < MIN_OPENING_SIZE || env.sill < 0) {
    throw new DomainError('out-of-range', 'Medidas de vano fuera de rango', {
      opening: opening.id,
      min: MIN_OPENING_SIZE,
    });
  }
  if (env.sill + env.height > wall.height - MIN_OPENING_HEADER) throw conflict('height', opening);
  const fp = footprints.get(wall.id);
  if (!fp) throw conflict('wall', opening);
  const usable = wallUsableSpan(fp);
  const span = openingSpan(opening);
  if (span.start < usable.start - TOLERANCE || span.end > usable.end + TOLERANCE) {
    throw conflict('wall', opening);
  }
  for (const other of level.openings) {
    if (other.id === opening.id || other.wallId !== wall.id) continue;
    const o = openingSpan(other);
    if (Math.min(span.end, o.end) - Math.max(span.start, o.start) > TOLERANCE) {
      throw conflict('overlap', opening);
    }
  }
}

export function assertLevelOpenings(level: Level): void {
  if (level.openings.length === 0) return;
  const footprints = levelWallFootprints(level);
  for (const opening of level.openings) assertOpeningFits(level, opening, footprints);
}

/** Rango de posiciones (centro) en que cabe un vano de ese ancho, o `null` si no cabe. */
export function openingOffsetRange(level: Level, wallId: string, width: number): AxisSpan | null {
  const fp = levelWallFootprints(level).get(wallId);
  if (!fp) return null;
  const usable = wallUsableSpan(fp);
  const range = { start: usable.start + width / 2, end: usable.end - width / 2 };
  return range.end + TOLERANCE >= range.start ? range : null;
}

/** Distancias libres del vano a los extremos de una cara del muro (mm). */
export function openingGaps(level: Level, opening: Opening, face: WallFace): AxisSpan | null {
  const fp = levelWallFootprints(level).get(opening.wallId);
  if (!fp) return null;
  const faceSpan = wallFaceSpan(fp, face);
  const span = openingSpan(opening);
  return { start: span.start - faceSpan.start, end: faceSpan.end - span.end };
}

export const openingsOfWall = (level: Level, wallId: string): Opening[] =>
  level.openings.filter((o) => o.wallId === wallId);

/** Centro del vano que deja `gap` mm libres hasta el extremo `end` de una cara del muro. */
export function openingOffsetForGap(
  level: Level,
  opening: Opening,
  face: WallFace,
  end: 'start' | 'end',
  gap: number,
): number | null {
  const fp = levelWallFootprints(level).get(opening.wallId);
  if (!fp) return null;
  const span = wallFaceSpan(fp, face);
  const { width } = openingEnvelope(opening);
  return end === 'start' ? span.start + gap + width / 2 : span.end - gap - width / 2;
}
