import { DomainError } from '../errors';
import type { IdFactory } from '../ids';
import { createEmptyLevel, DEFAULT_WALL_HEIGHT } from '../model/factory';
import { requireLevel } from '../model/queries';
import type { Level, Project } from '../model/types';
import { defineCommand } from './command';
import { assertRange } from './validation';

/**
 * Plantas (niveles) del proyecto. El documento siempre tuvo `levels[]` con `elevation` (altura del
 * piso de la planta, mm): estos comandos las crean y las ordenan. Las plantas se mantienen
 * ordenadas de abajo hacia arriba por su elevación.
 */

/** Espesor de la losa entre plantas (mm): la planta de arriba empieza sobre ella. */
export const SLAB_THICKNESS = 200;

export const LEVEL_ELEVATION = { min: -20_000, max: 200_000 } as const;

/** Altura de piso a piso de una planta: su muro más alto (o el de por defecto) más la losa. */
export function levelStoreyHeight(level: Level, fallback = DEFAULT_WALL_HEIGHT): number {
  const tallest = Math.max(0, ...level.walls.map((w) => w.height));
  return (tallest > 0 ? tallest : fallback) + SLAB_THICKNESS;
}

/** Elevación para una planta nueva sobre la más alta. */
export function nextLevelElevation(project: Project): number {
  const top = project.levels.reduce((a, b) => (b.elevation > a.elevation ? b : a));
  return top.elevation + levelStoreyHeight(top, project.settings.defaultWallHeight);
}

/** La planta inmediatamente arriba de otra, si la hay. */
export function levelAbove(project: Project, levelId: string): Level | undefined {
  const index = project.levels.findIndex((l) => l.id === levelId);
  return index >= 0 ? project.levels[index + 1] : undefined;
}

export function levelBelow(project: Project, levelId: string): Level | undefined {
  const index = project.levels.findIndex((l) => l.id === levelId);
  return index > 0 ? project.levels[index - 1] : undefined;
}

function sortLevels(project: Project): void {
  project.levels.sort((a, b) => a.elevation - b.elevation);
}

function cleanName(name: string): string {
  const clean = name.trim().slice(0, 80);
  if (clean === '') throw new DomainError('invalid-argument', 'El nombre no puede estar vacío');
  return clean;
}

/**
 * Copia el contenido de una planta con ids nuevos: el contorno (nodos, muros y espacios) y, si
 * `everything`, también puertas, ventanas y muebles.
 */
function copyLevel(source: Level, target: Level, ids: IdFactory, everything: boolean): void {
  const nodeIds = new Map(source.nodes.map((n) => [n.id, ids('node')]));
  const wallIds = new Map(source.walls.map((w) => [w.id, ids('wall')]));
  const nodeOf = (id: string) => nodeIds.get(id) ?? id;
  target.nodes = source.nodes.map((n) => ({ ...n, id: nodeOf(n.id) }));
  target.walls = source.walls.map((w) => ({
    ...w,
    id: wallIds.get(w.id) ?? w.id,
    start: nodeOf(w.start),
    end: nodeOf(w.end),
  }));
  target.rooms = source.rooms.map((r) => ({
    ...r,
    id: ids('room'),
    boundary: r.boundary.map(nodeOf),
  }));
  if (!everything) return;
  target.openings = source.openings.map((o) => ({
    ...o,
    id: ids('open'),
    wallId: wallIds.get(o.wallId) ?? o.wallId,
  }));
  target.items = source.items.map((i) => ({ ...i, id: ids('item') }));
}

export interface AddLevelArgs {
  readonly name: string;
  /** Por omisión, sobre la planta más alta (su muro más alto más la losa). */
  readonly elevation?: number;
  /** Copiar el contorno (muros y espacios, sin vanos ni muebles) de esta planta. */
  readonly copyOutlineFrom?: string;
}

export const addLevel = defineCommand<AddLevelArgs, { readonly levelId: string }>(
  'level.add',
  (draft, args, ctx) => {
    const elevation = Math.round(args.elevation ?? nextLevelElevation(draft));
    assertRange('elevation', elevation, LEVEL_ELEVATION.min, LEVEL_ELEVATION.max);
    const level = createEmptyLevel(cleanName(args.name), ctx.ids, elevation);
    if (args.copyOutlineFrom !== undefined) {
      copyLevel(requireLevel(draft, args.copyOutlineFrom), level, ctx.ids, false);
    }
    draft.levels.push(level);
    sortLevels(draft);
    return { levelId: level.id };
  },
);

/** Una planta igual a otra (con sus vanos y muebles), sobre la más alta. */
export const duplicateLevel = defineCommand<
  { readonly levelId: string; readonly name: string },
  { readonly levelId: string }
>('level.duplicate', (draft, args, ctx) => {
  const source = requireLevel(draft, args.levelId);
  const level = createEmptyLevel(cleanName(args.name), ctx.ids, nextLevelElevation(draft));
  copyLevel(source, level, ctx.ids, true);
  draft.levels.push(level);
  sortLevels(draft);
  return { levelId: level.id };
});

export const renameLevel = defineCommand<{ readonly levelId: string; readonly name: string }>(
  'level.rename',
  (draft, args) => {
    requireLevel(draft, args.levelId).name = cleanName(args.name);
  },
);

/** Cambia la altura del piso de una planta (las plantas se reordenan si hace falta). */
export const setLevelElevation = defineCommand<{
  readonly levelId: string;
  readonly elevation: number;
}>('level.setElevation', (draft, args) => {
  assertRange('elevation', args.elevation, LEVEL_ELEVATION.min, LEVEL_ELEVATION.max);
  requireLevel(draft, args.levelId).elevation = Math.round(args.elevation);
  sortLevels(draft);
});

/** Elimina una planta con todo su contenido. Siempre queda al menos una. */
export const removeLevel = defineCommand<{ readonly levelId: string }>(
  'level.remove',
  (draft, args) => {
    requireLevel(draft, args.levelId);
    if (draft.levels.length <= 1) {
      throw new DomainError('invalid-argument', 'Tiene que quedar al menos una planta', {
        field: 'level',
      });
    }
    draft.levels = draft.levels.filter((l) => l.id !== args.levelId);
  },
);
