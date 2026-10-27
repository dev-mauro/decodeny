import type { Part } from '@decodeny/domain';
import { useEffect, useMemo } from 'react';
import type { Material } from 'three';
import { mergeParts } from './merge-parts';

interface PartMeshesProps {
  readonly parts: readonly Part[];
  readonly materialOf: (slot: string, color?: string) => Material;
  /** `-1` invierte el eje z local (los vanos miden z hacia la cara izquierda = −Z en Three). */
  readonly zSign?: 1 | -1;
  readonly castShadow?: (slot: string) => boolean;
}

/**
 * Piezas de catálogo (mm) como mallas de Three (m): una malla por material, con las piezas de
 * ese material fusionadas (ver `mergeParts`), para mantener bajas las draw calls.
 */
export function PartMeshes({ parts, materialOf, zSign = 1, castShadow }: PartMeshesProps) {
  const merged = useMemo(() => mergeParts(parts, zSign), [parts, zSign]);
  // Las geometrías fusionadas son propias: se liberan de la GPU al cambiar o desmontar.
  useEffect(
    () => () => {
      for (const m of merged) m.geometry.dispose();
    },
    [merged],
  );
  return (
    <>
      {merged.map((m) => (
        <mesh
          key={m.key}
          geometry={m.geometry}
          material={materialOf(m.slot, m.color)}
          castShadow={castShadow?.(m.slot) ?? true}
          receiveShadow
        />
      ))}
    </>
  );
}
