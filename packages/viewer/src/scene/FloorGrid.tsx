import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, type Box3 } from 'three';
import { gridLines } from './floor-grid-lines';

/** Margen de cuadrícula alrededor de lo construido (m). */
const MARGIN = 4;

function lineGeometry(points: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  return geometry;
}

/**
 * Cuadrícula de trabajo sobre el suelo: apenas sobre los pisos (y bajo los muebles), para que se
 * vea dentro de los espacios. Líneas mayores cada metro (cada 5 m si el paso es de 1 m).
 */
export function FloorGrid({
  bounds,
  stepMm,
  elevationMm,
  colors,
}: {
  readonly bounds: Box3 | null;
  readonly stepMm: number;
  readonly elevationMm: number;
  readonly colors: readonly [string, string];
}) {
  const step = stepMm / 1000;
  const geometries = useMemo(() => {
    const min = bounds
      ? { x: bounds.min.x - MARGIN, z: bounds.min.z - MARGIN }
      : { x: -10, z: -10 };
    const max = bounds ? { x: bounds.max.x + MARGIN, z: bounds.max.z + MARGIN } : { x: 10, z: 10 };
    const majorEvery = stepMm < 1000 ? Math.round(1000 / stepMm) : 5;
    const { minor, major } = gridLines(min, max, step, majorEvery, elevationMm / 1000 + 0.003);
    return { minor: lineGeometry(minor), major: lineGeometry(major) };
  }, [bounds, elevationMm, step, stepMm]);
  useEffect(
    () => () => {
      geometries.minor.dispose();
      geometries.major.dispose();
    },
    [geometries],
  );
  const materials = useMemo(
    () => ({
      minor: new LineBasicMaterial({ color: colors[0], transparent: true, opacity: 0.55 }),
      major: new LineBasicMaterial({ color: colors[1], transparent: true, opacity: 0.8 }),
    }),
    [colors],
  );
  useEffect(
    () => () => {
      materials.minor.dispose();
      materials.major.dispose();
    },
    [materials],
  );
  return (
    <group name="floor-grid">
      <lineSegments geometry={geometries.minor} material={materials.minor} />
      <lineSegments geometry={geometries.major} material={materials.major} />
    </group>
  );
}
