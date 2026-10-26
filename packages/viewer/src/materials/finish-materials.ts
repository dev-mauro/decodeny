import { DEFAULT_FINISHES, resolveMaterialDefinition } from '@decodeny/catalog';
import {
  resolveMaterial,
  type MaterialInstance,
  type ResolvedMaterial,
  type SurfaceKind,
} from '@decodeny/domain';
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  type Material,
} from 'three';
import type { InteractionState } from '../selection';
import { paintMaterial } from './patterns';

/**
 * Materiales de Three para las terminaciones del documento. La textura se genera del patrón
 * del catálogo y se repite a escala física: las UV de muros y pisos están en metros, así que
 * `repeat = 1000 / tamaño del patrón en mm`.
 */

const LIMIT = 96;
const textures = new Map<string, DataTexture>();
const materials = new Map<string, Material>();

/** Recuerda a lo sumo `LIMIT` entradas y libera de la GPU las más antiguas. */
function remember<T extends { dispose(): void }>(cache: Map<string, T>, key: string, value: T) {
  const oldest = cache.keys().next();
  if (cache.size >= LIMIT && !oldest.done) {
    cache.get(oldest.value)?.dispose();
    cache.delete(oldest.value);
  }
  cache.set(key, value);
}

export const finishKey = (m: ResolvedMaterial): string =>
  JSON.stringify([m.definition.id, m.color, m.params, m.scale, m.rotation]);

function textureFor(m: ResolvedMaterial): DataTexture {
  const key = finishKey(m);
  let texture = textures.get(key);
  if (!texture) {
    const image = paintMaterial(m);
    texture = new DataTexture(image.data, image.width, image.height, RGBAFormat);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.repeat.set(1000 / (image.sizeMm[0] * m.scale), 1000 / (image.sizeMm[1] * m.scale));
    texture.rotation = (m.rotation * Math.PI) / 180;
    texture.needsUpdate = true;
    remember(textures, key, texture);
  }
  return texture;
}

/** Brillo de selección: emisivo azul (conserva la textura visible). */
const EMISSIVE: Record<InteractionState, number> = { normal: 0, hover: 0.12, selected: 0.28 };

export function finishMaterial(m: ResolvedMaterial, state: InteractionState): Material {
  const key = `${finishKey(m)}|${state}`;
  let material = materials.get(key);
  if (!material) {
    material = new MeshStandardMaterial({
      map: textureFor(m),
      roughness: m.definition.roughness,
      metalness: m.definition.metalness ?? 0,
      emissive: '#3b82f6',
      emissiveIntensity: EMISSIVE[state],
    });
    material.name = `decodeny:finish:${m.definition.id}`;
    remember(materials, key, material);
  }
  return material;
}

/** Instancias del documento resueltas contra el catálogo, por id. */
export function resolveFinishes(
  instances: readonly MaterialInstance[],
): Map<string, ResolvedMaterial> {
  return new Map(
    instances.map((m) => [m.id, resolveMaterial(resolveMaterialDefinition(m.def), m)]),
  );
}

const defaults = new Map<SurfaceKind, ResolvedMaterial>();

/** Terminación por defecto de un tipo de superficie (ver `DEFAULT_FINISHES`). */
export function defaultFinish(surface: SurfaceKind): ResolvedMaterial {
  let m = defaults.get(surface);
  if (!m) {
    m = resolveMaterial(resolveMaterialDefinition(DEFAULT_FINISHES[surface]));
    defaults.set(surface, m);
  }
  return m;
}
