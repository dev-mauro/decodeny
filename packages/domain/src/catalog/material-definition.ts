import type { MaterialInstance } from '../model/types';
import type { LocalizedText, ParamSpecs, ResolvedParams } from './params';
import { resolveParams } from './params';

/** Superficies donde puede aplicarse un material. */
export type SurfaceKind = 'wall' | 'floor' | 'ceiling';

export type MaterialCategory =
  'paint' | 'wallpaper' | 'wood' | 'tile' | 'stone' | 'textile' | 'masonry' | 'vinyl';

/**
 * Definición de material de catálogo (ADR-0004). No contiene imágenes: describe un **patrón**
 * (`pattern`, p. ej. `planks`, `tiles`) que el visor sabe dibujar a escala física real, con
 * parámetros propios (tamaño de baldosa, ancho de tabla, color de fragüe…). Así el catálogo
 * sigue siendo datos puros y cada material se ajusta a las medidas del usuario.
 */
export interface MaterialDefinition {
  /** Referencia versionada, p. ej. `floor.oak@1`. */
  readonly id: string;
  readonly name: LocalizedText;
  readonly category: MaterialCategory;
  readonly surfaces: readonly SurfaceKind[];
  readonly keywords?: readonly string[];
  /** Tipo de patrón que dibuja el visor. */
  readonly pattern: string;
  readonly params: ParamSpecs;
  /** Color base (el usuario puede cambiarlo si `tintable`). */
  readonly color: string;
  readonly tintable: boolean;
  /** Colores sugeridos (además de los ya usados en el proyecto). */
  readonly swatches?: readonly string[];
  readonly roughness: number;
  readonly metalness?: number;
}

export const defineMaterial = (definition: MaterialDefinition): MaterialDefinition => definition;

/** Valores efectivos de una instancia: color, parámetros, escala y rotación de la textura. */
export interface ResolvedMaterial {
  readonly definition: MaterialDefinition;
  readonly color: string;
  readonly params: ResolvedParams;
  /** Factor sobre el tamaño físico del patrón (1 = tal cual). */
  readonly scale: number;
  /** Giro de la textura en grados (p. ej. dirección de las tablas). */
  readonly rotation: number;
}

export function resolveMaterial(
  definition: MaterialDefinition,
  instance?: Pick<MaterialInstance, 'tint' | 'params' | 'scale' | 'rotation'>,
): ResolvedMaterial {
  return {
    definition,
    color: definition.tintable ? (instance?.tint ?? definition.color) : definition.color,
    params: resolveParams(definition.params, instance?.params ?? {}),
    scale: instance?.scale ?? 1,
    rotation: instance?.rotation ?? 0,
  };
}
