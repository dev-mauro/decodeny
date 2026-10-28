import type { Part } from '@decodeny/domain';

/** Segmentos de los cilindros de los muebles. */
export const CYLINDER_SEGMENTS = 28;

/**
 * Geometría de Three (m) de una pieza de catálogo (mm), compartida por la escena (`PartMeshes`)
 * y las miniaturas: una pieza nueva del catálogo se agrega solo aquí.
 */
export type PartGeometry =
  | {
      readonly kind: 'box';
      readonly position: readonly [number, number, number];
      readonly rotationY: number;
      /** Inclinación (rotación en x, antes del giro en y: orden `YXZ`). */
      readonly pitch: number;
      /** Ancho, alto y profundidad. */
      readonly args: readonly [number, number, number];
    }
  | {
      readonly kind: 'cylinder';
      readonly position: readonly [number, number, number];
      /** Sección elíptica cuando el mueble se escaló distinto en x y z. */
      readonly scaleZ: number;
      /** Radio arriba, radio abajo, alto y segmentos. */
      readonly args: readonly [number, number, number, number];
    };

/** `zSign = -1` invierte el eje z local (los vanos miden z hacia la cara izquierda = −Z). */
export function partGeometry(part: Part, zSign: 1 | -1 = 1): PartGeometry {
  const position = [part.at[0] / 1000, part.at[1] / 1000, (zSign * part.at[2]) / 1000] as const;
  if (part.kind === 'box') {
    return {
      kind: 'box',
      position,
      rotationY: part.rotationY ?? 0,
      // Invertir z invierte también el sentido de la inclinación.
      pitch: zSign * (part.pitch ?? 0),
      args: [part.size[0] / 1000, part.size[1] / 1000, part.size[2] / 1000],
    };
  }
  return {
    kind: 'cylinder',
    position,
    scaleZ: (part.radiusZ ?? part.radius) / part.radius,
    args: [
      (part.radiusTop ?? part.radius) / 1000,
      part.radius / 1000,
      part.height / 1000,
      CYLINDER_SEGMENTS,
    ],
  };
}
