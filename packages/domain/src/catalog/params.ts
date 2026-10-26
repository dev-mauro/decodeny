import type { Params } from '../model/types';

/** Texto localizado de una definición de catálogo (el catálogo no usa i18next). */
export interface LocalizedText {
  readonly es: string;
  readonly en?: string;
}

export function localize(text: LocalizedText, locale: string): string {
  return (locale.startsWith('en') ? text.en : undefined) ?? text.es;
}

interface BaseSpec {
  readonly label: LocalizedText;
  /** Parámetros secundarios: la UI los agrupa en "Avanzado". */
  readonly advanced?: boolean;
}

/** Longitud en mm. */
export interface LengthParamSpec extends BaseSpec {
  readonly kind: 'length';
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
}

export interface NumberParamSpec extends BaseSpec {
  readonly kind: 'number';
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: 'deg' | 'percent' | 'count';
}

export interface ChoiceOption {
  readonly value: string;
  readonly label: LocalizedText;
}

export interface ChoiceParamSpec extends BaseSpec {
  readonly kind: 'choice';
  readonly default: string;
  readonly options: readonly ChoiceOption[];
  /**
   * Significado geométrico de la opción, para que la UI la muestre en términos del usuario:
   * `wall-face` (valores `left`/`right`: hacia qué recinto) o `wall-end` (`start`/`end`:
   * izquierda/derecha vista desde un recinto).
   */
  readonly semantic?: 'wall-face' | 'wall-end';
}

export interface BooleanParamSpec extends BaseSpec {
  readonly kind: 'boolean';
  readonly default: boolean;
}

/** Color hexadecimal `#rrggbb` (p. ej. el fragüe de una cerámica). */
export interface ColorParamSpec extends BaseSpec {
  readonly kind: 'color';
  readonly default: string;
}

/** Imagen del usuario (p. ej. la foto de un cuadro): el valor es el id de un asset del proyecto. */
export interface ImageParamSpec extends BaseSpec {
  readonly kind: 'image';
  readonly default: '';
}

export type ParamSpec =
  | LengthParamSpec
  | NumberParamSpec
  | ChoiceParamSpec
  | BooleanParamSpec
  | ColorParamSpec
  | ImageParamSpec;
export type ParamSpecs = Readonly<Record<string, ParamSpec>>;

export type ParamValue<S extends ParamSpec> = S extends
  ChoiceParamSpec | ColorParamSpec | ImageParamSpec
  ? string
  : S extends BooleanParamSpec
    ? boolean
    : number;
export type ParamValues<P extends ParamSpecs> = { readonly [K in keyof P]: ParamValue<P[K]> };
export type ResolvedParams = Readonly<Record<string, number | string | boolean>>;

export const lengthParam = (spec: Omit<LengthParamSpec, 'kind'>): LengthParamSpec => ({
  kind: 'length',
  ...spec,
});
export const numberParam = (spec: Omit<NumberParamSpec, 'kind'>): NumberParamSpec => ({
  kind: 'number',
  ...spec,
});
export const choiceParam = (spec: Omit<ChoiceParamSpec, 'kind'>): ChoiceParamSpec => ({
  kind: 'choice',
  ...spec,
});
export const booleanParam = (spec: Omit<BooleanParamSpec, 'kind'>): BooleanParamSpec => ({
  kind: 'boolean',
  ...spec,
});
export const colorParam = (spec: Omit<ColorParamSpec, 'kind'>): ColorParamSpec => ({
  kind: 'color',
  ...spec,
});

export const imageParam = (spec: Omit<ImageParamSpec, 'kind' | 'default'>): ImageParamSpec => ({
  kind: 'image',
  default: '',
  ...spec,
});

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Valor válido para el parámetro, o el valor por defecto si `raw` no lo es. */
export function resolveParam(spec: ParamSpec, raw: unknown): number | string | boolean {
  switch (spec.kind) {
    case 'length':
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return spec.default;
      const value = Math.min(spec.max, Math.max(spec.min, raw));
      return spec.kind === 'length' || spec.unit === 'count' ? Math.round(value) : value;
    }
    case 'choice':
      return typeof raw === 'string' && spec.options.some((o) => o.value === raw)
        ? raw
        : spec.default;
    case 'boolean':
      return typeof raw === 'boolean' ? raw : spec.default;
    case 'color':
      return typeof raw === 'string' && HEX_COLOR.test(raw) ? raw.toLowerCase() : spec.default;
    case 'image':
      return typeof raw === 'string' ? raw : '';
  }
}

/**
 * Parámetros completos y dentro de rango. Las claves desconocidas se ignoran aquí pero el
 * documento las conserva (tolerancia hacia adelante, ver plan §1.6).
 */
export function resolveParams<P extends ParamSpecs>(specs: P, raw: Params = {}): ParamValues<P> {
  const out: Record<string, number | string | boolean> = {};
  for (const [key, spec] of Object.entries(specs)) out[key] = resolveParam(spec, raw[key]);
  return out as ParamValues<P>;
}

export const defaultParams = <P extends ParamSpecs>(specs: P): ParamValues<P> =>
  resolveParams(specs, {});
