import type { Opening } from '../model/types';
import {
  resolveParams,
  type LocalizedText,
  type ParamSpecs,
  type ParamValues,
  type ResolvedParams,
} from './params';
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

/**
 * Cómo se abre y se cierra una hoja durante el recorrido: el parámetro numérico que la mueve
 * (p. ej. `openAngle` o `open` en %) y su valor cerrada. Abierta toma el valor del documento o,
 * si en el documento está cerrada, el valor por defecto del parámetro.
 */
export interface OperableSpec {
  readonly param: string;
  readonly closed: number;
}

export interface OpeningDefinition<P extends ParamSpecs = ParamSpecs> {
  /** Referencia versionada, p. ej. `door.single@1` (es lo que guarda el documento). */
  readonly id: string;
  readonly kind: OpeningKind;
  readonly name: LocalizedText;
  readonly description?: LocalizedText;
  readonly params: P;
  /** La persona puede atravesarlo en modo recorrido (puertas y vanos libres). */
  readonly passable: boolean;
  /** Se abre y se cierra en el recorrido; cerrada, no se atraviesa. */
  readonly operable?: OperableSpec;
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

/** En el documento, la hoja está cerrada (y en el recorrido empieza cerrada). */
export function isDesignedClosed(
  definition: AnyOpeningDefinition,
  params: Opening['params'],
): boolean {
  const spec = definition.operable;
  if (!spec) return false;
  const value = resolveParams(definition.params, params)[spec.param];
  return typeof value === 'number' && value === spec.closed;
}

/**
 * Parámetros de una hoja a medio abrir: `openness` 0 = cerrada, 1 = abierta (el valor del
 * documento o, si allí está cerrada, el valor por defecto del parámetro).
 */
export function operableParams(
  definition: AnyOpeningDefinition,
  params: Opening['params'],
  openness: number,
): ResolvedParams {
  const resolved = resolveParams(definition.params, params);
  const spec = definition.operable;
  if (!spec) return resolved;
  const designed = resolved[spec.param];
  const fallback = definition.params[spec.param]?.default;
  const open =
    typeof designed === 'number' && designed !== spec.closed
      ? designed
      : typeof fallback === 'number'
        ? fallback
        : spec.closed;
  const t = Math.min(1, Math.max(0, openness));
  return { ...resolved, [spec.param]: spec.closed + (open - spec.closed) * t };
}
