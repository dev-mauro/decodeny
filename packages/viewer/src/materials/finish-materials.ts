import { DEFAULT_FINISHES, resolveMaterialDefinition } from '@decodeny/catalog';
import {
  resolveMaterial,
  type MaterialInstance,
  type ResolvedMaterial,
  type SurfaceKind,
} from '@decodeny/domain';
import {
  Color,
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
import { SECTION_PLANES } from './section-planes';

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

/**
 * Cuadrícula de trabajo pintada sobre los pisos (en el shader, a partir de la posición en el
 * mundo): no depende de la profundidad, así que se ve igual en cualquier GPU. Uniforms
 * compartidos por todos los pisos: activarla o cambiar el paso no crea materiales nuevos.
 */
const FLOOR_GRID = {
  uFloorGridStep: { value: 0 },
  uFloorGridMajor: { value: 10 },
  uFloorGridColor: { value: new Color('#5f6b7a') },
};

/** Paso de la cuadrícula de los pisos en m (`0`: sin cuadrícula) y cada cuántas líneas una mayor. */
export function setFloorGrid(stepMeters: number, majorEvery = 10, color = '#5f6b7a'): void {
  FLOOR_GRID.uFloorGridStep.value = stepMeters;
  FLOOR_GRID.uFloorGridMajor.value = majorEvery;
  FLOOR_GRID.uFloorGridColor.value.set(color);
}

function withFloorGrid(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, FLOOR_GRID);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vFloorWorld;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvFloorWorld = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vFloorWorld;
uniform float uFloorGridStep;
uniform float uFloorGridMajor;
uniform vec3 uFloorGridColor;
// Distancia (m) a la línea más cercana de una grilla de paso \`step\`, y línea de ancho \`width\` (m)
// con borde suave. Ancho en el mundo, sin derivadas (fwidth no es confiable en toda GPU).
float floorGridLine(vec2 world, float step, float width) {
  vec2 d = abs(fract(world / step + 0.5) - 0.5) * step;
  float dist = min(d.x, d.y);
  return 1.0 - smoothstep(width * 0.5, width, dist);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
if (uFloorGridStep > 0.0) {
  float minor = floorGridLine(vFloorWorld, uFloorGridStep, 0.012);
  float major = floorGridLine(vFloorWorld, uFloorGridStep * uFloorGridMajor, 0.025);
  diffuseColor.rgb = mix(diffuseColor.rgb, uFloorGridColor, max(minor * 0.6, major * 0.8));
}`,
      );
  };
  material.customProgramCacheKey = () => 'decodeny-floor-grid';
}

/** Brillo de selección: emisivo azul (conserva la textura visible). */
const EMISSIVE: Record<InteractionState, number> = { normal: 0, hover: 0.12, selected: 0.28 };

/**
 * Material de una terminación. `floor`: lleva la cuadrícula de trabajo y se empuja apenas hacia
 * atrás en profundidad (`polygonOffset`) para que lo que va a ras del piso (alfombras) gane.
 */
export function finishMaterial(
  m: ResolvedMaterial,
  state: InteractionState,
  floor = false,
  /** Se recorta con el corte de muros (la de un muro que queda entero, no). */
  section = true,
): Material {
  const key = `${finishKey(m)}|${state}${floor ? '|floor' : ''}${section ? '' : '|whole'}`;
  let material = materials.get(key);
  if (!material) {
    const standard = new MeshStandardMaterial({
      map: textureFor(m),
      roughness: m.definition.roughness,
      metalness: m.definition.metalness ?? 0,
      emissive: '#3b82f6',
      emissiveIntensity: EMISSIVE[state],
      // Las terminaciones visten la envolvente (muros, pisos, cielos): se cortan con ella.
      clippingPlanes: section ? SECTION_PLANES : null,
      ...(floor ? { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 } : {}),
    });
    if (floor) withFloorGrid(standard);
    material = standard;
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
