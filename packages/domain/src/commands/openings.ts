import { DomainError } from '../errors';
import { openingEnvelope } from '../catalog/opening-definition';
import {
  assertOpeningFits,
  openingOffsetRange,
  openingSpan,
  openingsOfWall,
  type AxisSpan,
} from '../model/openings';
import { requireLevel, requireWall } from '../model/queries';
import { DefinitionRefSchema } from '../model/schema';
import type { Level, Opening, Params } from '../model/types';
import { defineCommand } from './command';

export interface OpeningRef {
  readonly levelId: string;
  readonly openingId: string;
}

function requireOpening(level: Level, openingId: string): Opening {
  const opening = level.openings.find((o) => o.id === openingId);
  if (!opening) {
    throw new DomainError('not-found', `Vano ${openingId} no existe`, { id: openingId });
  }
  return opening;
}

export interface AddOpeningArgs {
  readonly levelId: string;
  readonly wallId: string;
  /** Referencia de catálogo, p. ej. `door.single@1`. */
  readonly def: string;
  /** Parámetros completos (la UI los resuelve con los valores por defecto del catálogo). */
  readonly params: Params;
  /**
   * Centro del vano desde el nodo `start` del muro. Por defecto, el centro del tramo útil o,
   * si está ocupado, el lugar libre más cercano a él.
   */
  readonly offset?: number;
}

/** Separación entre un vano nuevo y los existentes al ubicarlo automáticamente (mm). */
const AUTO_GAP = 100;

function freeOffset(range: AxisSpan, width: number, taken: readonly AxisSpan[]): number | null {
  const center = (range.start + range.end) / 2;
  const candidates = [
    center,
    ...taken.flatMap((t) => [t.start - AUTO_GAP - width / 2, t.end + AUTO_GAP + width / 2]),
  ]
    .filter((c) => c >= range.start - 0.5 && c <= range.end + 0.5)
    .filter((c) => taken.every((t) => c + width / 2 <= t.start || c - width / 2 >= t.end))
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  return candidates[0] ?? null;
}

/** Inserta una puerta o ventana en un muro. */
export const addOpening = defineCommand<AddOpeningArgs, { readonly openingId: string }>(
  'opening.add',
  (draft, args, ctx) => {
    if (!DefinitionRefSchema.safeParse(args.def).success) {
      throw new DomainError('invalid-argument', 'Referencia de catálogo inválida', {
        def: args.def,
      });
    }
    const level = requireLevel(draft, args.levelId);
    requireWall(level, args.wallId);
    const { width } = openingEnvelope({ params: args.params });
    const range = openingOffsetRange(level, args.wallId, width);
    if (!range) {
      throw new DomainError('opening-conflict', 'El vano no cabe en el muro', { reason: 'wall' });
    }
    const taken = openingsOfWall(level, args.wallId).map(openingSpan);
    const offset = args.offset ?? freeOffset(range, width, taken);
    if (offset === null) {
      throw new DomainError('opening-conflict', 'No queda espacio libre en el muro', {
        reason: 'overlap',
      });
    }
    const opening: Opening = {
      id: ctx.ids('open'),
      wallId: args.wallId,
      def: args.def,
      offset: Math.round(offset),
      params: { ...args.params },
    };
    level.openings.push(opening);
    assertOpeningFits(level, opening);
    return { openingId: opening.id };
  },
);

export interface UpdateOpeningArgs extends OpeningRef {
  /** Cambia el tipo (p. ej. de batiente a corredera) conservando medidas y posición. */
  readonly def?: string;
  /** Parámetros a cambiar (se combinan con los actuales). */
  readonly params?: Params;
  readonly offset?: number;
}

/** Cambia tipo, parámetros y/o posición de un vano. */
export const updateOpening = defineCommand<UpdateOpeningArgs>('opening.update', (draft, args) => {
  const level = requireLevel(draft, args.levelId);
  const opening = requireOpening(level, args.openingId);
  if (args.def !== undefined) {
    if (!DefinitionRefSchema.safeParse(args.def).success) {
      throw new DomainError('invalid-argument', 'Referencia de catálogo inválida', {
        def: args.def,
      });
    }
    opening.def = args.def;
  }
  if (args.params) Object.assign(opening.params, args.params);
  if (args.offset !== undefined) {
    if (!Number.isFinite(args.offset)) {
      throw new DomainError('invalid-argument', 'Posición inválida', { field: 'offset' });
    }
    opening.offset = Math.max(0, Math.round(args.offset));
  }
  assertOpeningFits(level, opening);
});

export const deleteOpening = defineCommand<OpeningRef>('opening.delete', (draft, args) => {
  const level = requireLevel(draft, args.levelId);
  requireOpening(level, args.openingId);
  level.openings = level.openings.filter((o) => o.id !== args.openingId);
});
