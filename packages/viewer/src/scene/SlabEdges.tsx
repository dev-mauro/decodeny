import { memo } from 'react';
import { buildSlabEdgesMesh } from '../builders/surface-mesh';
import { toBufferGeometry } from '../builders/to-buffer-geometry';
import { defaultFinish, finishMaterial } from '../materials/finish-materials';
import type { SlabBelow } from './slabs';
import { pointsKey, useKeyedGeometry } from './use-keyed-geometry';

const SURFACE_SLOTS = ['surface'] as const;

/**
 * Canto de la losa bajo una planta: cierra la fachada entre el cielo de la planta de abajo y el
 * piso de esta, y el borde de los huecos de escalera.
 */
export const SlabEdges = memo(function SlabEdges({ slab }: { readonly slab: SlabBelow }) {
  const key = `${slab.depth}|${slab.regions
    .map((r) => [r.outline, ...r.holes].map(pointsKey).join('/'))
    .join('|')}`;
  const geometry = useKeyedGeometry(key, () =>
    toBufferGeometry(buildSlabEdgesMesh(slab.regions, slab.depth), SURFACE_SLOTS),
  );
  if (slab.depth <= 0) return null;
  return (
    <mesh
      geometry={geometry}
      material={finishMaterial(defaultFinish('wall'), 'normal')}
      castShadow
      receiveShadow
    />
  );
});
