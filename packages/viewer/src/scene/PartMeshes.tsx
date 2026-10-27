import type { Part } from '@decodeny/domain';
import type { Material } from 'three';
import { partGeometry } from './part-geometry';

interface PartMeshesProps {
  readonly parts: readonly Part[];
  readonly materialOf: (slot: string, color?: string) => Material;
  /** `-1` invierte el eje z local (los vanos miden z hacia la cara izquierda = −Z en Three). */
  readonly zSign?: 1 | -1;
  readonly castShadow?: (slot: string) => boolean;
}

/** Piezas de catálogo (mm) como mallas de Three (m). Una malla por pieza: pocas por objeto. */
export function PartMeshes({ parts, materialOf, zSign = 1, castShadow }: PartMeshesProps) {
  return (
    <>
      {parts.map((part, i) => {
        const geometry = partGeometry(part, zSign);
        const shadow = castShadow?.(part.slot) ?? true;
        if (geometry.kind === 'box') {
          return (
            <mesh
              key={i}
              position={geometry.position}
              rotation-y={geometry.rotationY}
              material={materialOf(part.slot, part.color)}
              castShadow={shadow}
              receiveShadow
            >
              <boxGeometry args={geometry.args} />
            </mesh>
          );
        }
        return (
          <mesh
            key={i}
            position={geometry.position}
            scale-z={geometry.scaleZ}
            material={materialOf(part.slot, part.color)}
            castShadow={shadow}
            receiveShadow
          >
            <cylinderGeometry args={geometry.args} />
          </mesh>
        );
      })}
    </>
  );
}
