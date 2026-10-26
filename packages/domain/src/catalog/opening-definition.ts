import type { Opening } from '../model/types';
import type { LocalizedText, ParamSpecs, ParamValues, ResolvedParams } from './params';
import type { Part, PlanStroke } from './parts';

/**
 * Marco local de un vano: origen en el eje del muro a la altura del piso, en el centro del vano.
 * `x` a lo largo del muro (de start a end), `y` hacia arriba, `z` hacia la cara **izquierda**
 * del muro. Unidades: mm.
 */
export interface OpeningBuildContext {
  readonly wallThickness: number;
}

/**
 * Parámetros comunes a todo vano (su "envolvente"), que el dominio valida contra el muro.
 * Cada definición debe declarar `width` y `height`; `sill` (antepecho) es 0 si no lo declara.
 */
export interface OpeningEnvelope {
  readonly width: number;
  readonly height: number;
  readonly sill: number;
}

export type OpeningKind = 'door' | 'window';

export interface OpeningDefinition<P extends ParamSpecs = ParamSpecs> {
  /** Referencia versionada, p. ej. `door.single@1` (es lo que guarda el documento). */
  readonly id: string;
  readonly kind: OpeningKind;
  readonly name: LocalizedText;
  readonly description?: LocalizedText;
  readonly params: P;
  /** La persona puede atravesarlo en modo recorrido (puertas y vanos libres). */
  readonly passable: boolean;
  readonly build: (params: ParamValues<P>, ctx: OpeningBuildContext) => readonly Part[];
  /** Símbolos en planta (arcos de apertura…), visibles en edición. */
  readonly plan?: (params: ParamValues<P>, ctx: OpeningBuildContext) => readonly PlanStroke[];
}

/** Definición con los tipos de parámetros borrados, para guardarla en un registro. */
export interface AnyOpeningDefinition extends Omit<OpeningDefinition, 'build' | 'plan'> {
  readonly build: (params: ResolvedParams, ctx: OpeningBuildContext) => readonly Part[];
  readonly plan?: (params: ResolvedParams, ctx: OpeningBuildContext) => readonly PlanStroke[];
}

export function defineOpening<P extends ParamSpecs>(
  definition: OpeningDefinition<P>,
): AnyOpeningDefinition {
  return definition as unknown as AnyOpeningDefinition;
}

const numeric = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Envolvente de un vano a partir de sus parámetros guardados. */
export function openingEnvelope(opening: Pick<Opening, 'params'>): OpeningEnvelope {
  return {
    width: numeric(opening.params.width, 0),
    height: numeric(opening.params.height, 0),
    sill: numeric(opening.params.sill, 0),
  };
}
