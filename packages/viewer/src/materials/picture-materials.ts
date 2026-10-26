import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import {
  Color,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Material,
  type Texture,
} from 'three';
import type { InteractionState } from '../selection';

/**
 * Imágenes del usuario (cuadros). La aplicación entrega una URL por asset (p. ej. un object URL
 * de IndexedDB); aquí se carga una sola vez como textura y se comparte.
 */
const textures = new Map<string, Promise<Texture>>();
const loader = new TextureLoader();

function loadTexture(url: string): Promise<Texture> {
  let promise = textures.get(url);
  if (!promise) {
    promise = loader.loadAsync(url).then((texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      return texture;
    });
    textures.set(url, promise);
  }
  return promise;
}

/** Textura de una imagen del usuario, o `null` mientras carga (o si no hay). */
export function usePictureTexture(url: string | undefined): Texture | null {
  const invalidate = useThree((s) => s.invalidate);
  const [loaded, setLoaded] = useState<{ url: string; texture: Texture } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    loadTexture(url)
      .then((texture) => {
        if (!alive) return;
        setLoaded({ url, texture });
        invalidate();
      })
      .catch(() => {
        textures.delete(url);
      });
    return () => {
      alive = false;
    };
  }, [invalidate, url]);
  return url && loaded?.url === url ? loaded.texture : null;
}

const materials = new Map<string, Material>();
const EMISSIVE: Record<InteractionState, number> = { normal: 0, hover: 0.1, selected: 0.22 };

/** Material de la imagen de un cuadro; sin imagen, un lienzo neutro. */
export function pictureMaterial(texture: Texture | null, state: InteractionState): Material {
  const key = `${texture?.uuid ?? 'empty'}|${state}`;
  let material = materials.get(key);
  if (!material) {
    material = new MeshStandardMaterial({
      color: texture ? '#ffffff' : '#d9d4cc',
      roughness: 0.6,
      emissive: new Color('#3b82f6'),
      emissiveIntensity: EMISSIVE[state],
      ...(texture ? { map: texture } : {}),
    });
    materials.set(key, material);
  }
  return material;
}
