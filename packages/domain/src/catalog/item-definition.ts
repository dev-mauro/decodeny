import type { Item, Params } from '../model/types';
import type { LocalizedText, ParamSpecs, ParamValues, ResolvedParams } from './params';
import { fitParts, fitTransform, type Part, type Vec3Mm } from './parts';

/**
 * Marco local de un item: origen en el centro de su huella, a la altura del piso.
 * `x` a lo ancho (hacia la derecha mirando el frente), `y` hacia arriba, `z` a lo profundo con
 * el **frente en +z** (donde uno se sienta o se para). Unidades: mm. Con rotación 0 el frente
 * mira al sur de la planta.
 */

/** Medidas exteriores del item (su caja envolvente), en mm. */
export interface ItemEnvelope {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/** Dónde se apoya el item. Hoy solo `floor`; el resto llega con la decoración (I6). */
export type ItemMount = 'floor' | 'wall' | 'ceiling' | 'surface';

/**
 * Interacción posible con el item, declarada desde ya para sentarse/acostarse (backlog):
 * `at` es el punto de apoyo (asiento, colchón) en el marco local.
 */
export interface Affordance {
  readonly kind: 'sit' | 'lie';
  readonly at: Vec3Mm;
}

export interface ItemPreset {
  readonly name: LocalizedText;
  readonly params: Params;
}

export type ItemCategory =
  | 'table'
  | 'chair'
  | 'sofa'
  | 'desk'
  | 'bed'
  | 'bath'
  | 'storage'
  | 'kitchen'
  | 'lighting'
  | 'decor';

/**
 * Fuente de luz de un item (luminaria). `at` en el marco local; el flujo luminoso en lúmenes y
 * la temperatura de color en kelvin vienen de los parámetros del item.
 */
export interface LightEmitter {
  readonly at: Vec3Mm;
  readonly lumens: number;
  readonly kelvin: number;
  /** `spot` ilumina hacia abajo en un cono (focos embutidos); `point`, en todas direcciones. */
  readonly kind: 'point' | 'spot';
  /** Apertura del cono (grados) para `spot`. */
  readonly angle?: number;
}

export interface ItemDefinition<P extends ParamSpecs = ParamSpecs> {
  /** Referencia versionada, p. ej. `furniture.table-rect@1`. */
  readonly id: string;
  readonly category: ItemCategory;
  readonly name: LocalizedText;
  /** Términos adicionales para la búsqueda del catálogo. */
  readonly keywords?: readonly string[];
  readonly params: P;
  /** Medidas típicas ("cama 2 plazas: 1400 × 1900"). */
  readonly presets?: readonly ItemPreset[];
  readonly mount: ItemMount;
  /**
   * Altura inicial (mm) de la base sobre el piso para montajes `wall` y `surface` (un cuadro a
   * 1,50 m al centro, un aplique a 1,80 m). Los `ceiling` cuelgan del cielo del recinto.
   */
  readonly defaultElevation?: number;
  /** Bloquea el paso en modo recorrido (por defecto, sí). */
  readonly solid?: boolean;
  /**
   * Medidas mínimas con las que el generador conserva sus proporciones. Por debajo, el mueble
   * se construye en esas medidas y se escala a lo pedido (ver `buildItemParts`): así el
   * usuario puede ingresar cualquier medida sin que la geometría se rompa.
   */
  readonly comfortMin?: ItemEnvelope;
  /** Envolvente a partir de los parámetros; por defecto `width`/`depth`/`height`. */
  readonly envelope?: (params: ParamValues<P>) => ItemEnvelope;
  readonly build: (params: ParamValues<P>) => readonly Part[];
  readonly affordances?: (params: ParamValues<P>) => readonly Affordance[];
  /** Luces que emite (si está encendido); ver `LightEmitter`. */
  readonly emitters?: (params: ParamValues<P>) => readonly LightEmitter[];
}

/** Definición con los tipos de parámetros borrados, para guardarla en un registro. */
export interface AnyItemDefinition extends Omit<
  ItemDefinition,
  'envelope' | 'build' | 'affordances' | 'emitters'
> {
  readonly emitters?: (params: ResolvedParams) => readonly LightEmitter[];
  readonly envelope?: (params: ResolvedParams) => ItemEnvelope;
  readonly build: (params: ResolvedParams) => readonly Part[];
  readonly affordances?: (params: ResolvedParams) => readonly Affordance[];
}

export function defineItem<P extends ParamSpecs>(definition: ItemDefinition<P>): AnyItemDefinition {
  return definition as unknown as AnyItemDefinition;
}

const numeric = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Envolvente de una definición para unos parámetros ya resueltos. */
export function definitionEnvelope(
  definition: AnyItemDefinition,
  params: ResolvedParams,
): ItemEnvelope {
  return (
    definition.envelope?.(params) ?? {
      width: numeric(params.width),
      depth: numeric(params.depth),
      height: numeric(params.height),
    }
  );
}

/** Parámetros agrandados hasta `comfortMin`, o `null` si ya lo cumplen. */
function grownParams(definition: AnyItemDefinition, params: ResolvedParams): ResolvedParams | null {
  const env = definitionEnvelope(definition, params);
  const min = definition.comfortMin;
  if (!min || (env.width >= min.width && env.depth >= min.depth && env.height >= min.height)) {
    return null;
  }
  const grown: Record<string, number | string | boolean> = { ...params };
  const raise = (key: string, value: number) => {
    const current = grown[key];
    if (typeof current === 'number') grown[key] = Math.max(current, value);
  };
  raise('width', min.width);
  raise('depth', min.depth);
  raise('height', min.height);
  raise('diameter', Math.max(min.width, min.depth));
  return grown;
}

/**
 * Piezas de un mueble para unos parámetros resueltos. Por encima de `comfortMin` es
 * paramétrico puro; por debajo se construye en el mínimo y se escala a la envolvente pedida.
 */
export function buildItemParts(definition: AnyItemDefinition, params: ResolvedParams): Part[] {
  const grown = grownParams(definition, params);
  if (!grown) return [...definition.build(params)];
  const env = definitionEnvelope(definition, params);
  return fitParts(definition.build(grown), env.width, env.height, env.depth);
}

/** Afordancias (sentarse, acostarse) con la misma escala que las piezas. */
export function itemAffordances(
  definition: AnyItemDefinition,
  params: ResolvedParams,
): Affordance[] {
  const grown = grownParams(definition, params);
  if (!grown) return [...(definition.affordances?.(params) ?? [])];
  const env = definitionEnvelope(definition, params);
  const transform = fitTransform(definition.build(grown), env.width, env.height, env.depth);
  return (definition.affordances?.(grown) ?? []).map((a) => ({ ...a, at: transform.point(a.at) }));
}

/** Resuelve la envolvente de un item del documento (la provee el catálogo). */
export type ItemEnvelopeResolver = (item: Item) => ItemEnvelope;
