import { useEffect, useMemo } from 'react';
import type { BufferGeometry } from 'three';

/**
 * Construye una geometría solo cuando cambia `key` (que debe codificar todas sus entradas)
 * y libera la anterior de la GPU.
 */
export function useKeyedGeometry(key: string, build: () => BufferGeometry): BufferGeometry {
  // `key` codifica todas las entradas de `build`; incluir `build` reconstruiría en cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => build(), [key]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export const pointsKey = (points: readonly { x: number; y: number }[]): string =>
  points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(';');
