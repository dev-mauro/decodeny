import type { Item, Params } from '../model/types';
import type { LocalizedText, ParamSpecs, ParamValues, ResolvedParams } from './params';
import { fitParts, fitTransform, type Part, type PlanStroke, type Vec3Mm } from './parts';

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
 * Interacción posible con el item: sentarse o acostarse (backlog; `at` es el punto de apoyo,
 * asiento o colchón, en el marco local) o viajar entre plantas (`travel`, un ascensor: `at` es
 * el centro de la cabina).
 */
export interface Affordance {
  readonly kind: 'sit' | 'lie' | 'travel';
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
  | 'decor'
  | 'stairs';

/**
 * Caja de colisión del recorrido en el marco local (mm), con el mismo giro e inclinación que una
 * `BoxPart`: una caja inclinada es una rampa (así se suben las escaleras sin saltos).
 */
export interface CollisionBox {
  readonly size: Vec3Mm;
  readonly at: Vec3Mm;
  readonly rotationY?: number;
  readonly pitch?: number;
  /**
   * Rampa por la línea de paso (`walkPath`): en el recorrido sostiene a la persona solo fuera de
   * ella; sobre la escalera, la altura sale de la línea (sin las uniones ni quiebres de la rampa).
   */
  readonly walkway?: boolean;
}

/** Polígono en el plano x–z del marco local (mm). */
export type LocalPolygon = readonly (readonly [number, number])[];

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
  /** Colisión en el recorrido; por defecto, la caja envolvente (si es `solid`). */
  readonly colliders?: (params: ParamValues<P>) => readonly CollisionBox[];
  /**
   * Hueco que abre en la losa de arriba (escaleras, ductos, dobles alturas): se descuenta del
   * cielo de su planta y del piso de la planta de arriba.
   */
  readonly floorOpening?: (params: ParamValues<P>) => LocalPolygon;
  /** Cuántas losas atraviesa ese hueco hacia arriba (un ascensor de 3 paradas, 2); por defecto 1. */
  readonly openingSpan?: (params: ParamValues<P>) => number;
  /**
   * Camino de subida por la línea de paso (marco local, de abajo hacia arriba). En el recorrido,
   * sobre sus tramos inclinados la altura de los pies sale de esta línea (se sube parejo, sin
   * escalones) y el paso se endereza suavemente con ella si se camina a lo largo.
   */
  readonly walkPath?: (params: ParamValues<P>) => readonly Vec3Mm[];
  /** Ancho (mm) por el que se camina alrededor de `walkPath` (por defecto, 900). */
  readonly walkWidth?: (params: ParamValues<P>) => number;
  /** Contorno en el plano (por defecto, el rectángulo de su envolvente). */
  readonly planOutline?: (params: ParamValues<P>) => LocalPolygon;
  /** Símbolo en el plano (peldaños, sentido de subida), en el marco local. */
  readonly planSymbol?: (params: ParamValues<P>) => readonly PlanStroke[];
  /**
   * Su parámetro `height` es la altura de piso a piso (hasta la planta a `openingSpan` plantas):
   * al ubicarlo toma la de su planta, y se avisa si no llega.
   */
  readonly fillsStorey?: boolean;
}

type DerivedFields =
  | 'envelope'
  | 'build'
  | 'affordances'
  | 'emitters'
  | 'colliders'
  | 'floorOpening'
  | 'openingSpan'
  | 'walkPath'
  | 'walkWidth'
  | 'planOutline'
  | 'planSymbol';

/** Definición con los tipos de parámetros borrados, para guardarla en un registro. */
export interface AnyItemDefinition extends Omit<ItemDefinition, DerivedFields> {
  readonly emitters?: (params: ResolvedParams) => readonly LightEmitter[];
  readonly colliders?: (params: ResolvedParams) => readonly CollisionBox[];
  readonly floorOpening?: (params: ResolvedParams) => LocalPolygon;
  readonly openingSpan?: (params: ResolvedParams) => number;
  readonly walkPath?: (params: ResolvedParams) => readonly Vec3Mm[];
  readonly walkWidth?: (params: ResolvedParams) => number;
  readonly planOutline?: (params: ResolvedParams) => LocalPolygon;
  readonly planSymbol?: (params: ResolvedParams) => readonly PlanStroke[];
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
