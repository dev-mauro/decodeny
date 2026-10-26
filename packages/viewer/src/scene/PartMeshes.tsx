import type { Part } from '@decodeny/domain';
import type { Material } from 'three';

interface PartMeshesProps {
  readonly parts: readonly Part[];
  readonly materialOf: (slot: string, color?: string) => Material;
  /** `-1` invierte el eje z local (los vanos miden z hacia la cara izquierda = −Z en Three). */
  readonly zSign?: 1 | -1;
  readonly castShadow?: (slot: string) => boolean;
}

const CYLINDER_SEGMENTS = 28;

/** Piezas de catálogo (mm) como mallas de Three (m). Una malla por pieza: pocas por objeto. */
export function PartMeshes({ parts, materialOf, zSign = 1, castShadow }: PartMeshesProps) {
  return (
    <>
      {parts.map((part, i) => {
        const position = [
          part.at[0] / 1000,
          part.at[1] / 1000,
          (zSign * part.at[2]) / 1000,
        ] as const;
        const shadow = castShadow?.(part.slot) ?? true;
        if (part.kind === 'box') {
          return (
            <mesh
              key={i}
              position={position}
              rotation-y={part.rotationY ?? 0}
              material={materialOf(part.slot, part.color)}
              castShadow={shadow}
              receiveShadow
            >
              <boxGeometry args={[part.size[0] / 1000, part.size[1] / 1000, part.size[2] / 1000]} />
            </mesh>
          );
        }
        return (
          <mesh
            key={i}
            position={position}
            // Sección elíptica cuando el mueble se escaló distinto en x y z.
            scale-z={(part.radiusZ ?? part.radius) / part.radius}
            material={materialOf(part.slot, part.color)}
            castShadow={shadow}
            receiveShadow
          >
            <cylinderGeometry
              args={[
                (part.radiusTop ?? part.radius) / 1000,
                part.radius / 1000,
                part.height / 1000,
                CYLINDER_SEGMENTS,
              ]}
            />
          </mesh>
        );
      })}
    </>
  );
}
