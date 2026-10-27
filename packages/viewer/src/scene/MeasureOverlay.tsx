import { formatLength } from '@decodeny/domain';
import { Html, Line } from '@react-three/drei';
import type { CSSProperties } from 'react';
import { planToWorld } from '../coords';

import { measureDistance, type MeasurePoint } from './measure';

const labelStyle: CSSProperties = {
  padding: '3px 8px',
  borderRadius: 8,
  font: '700 13px/1.3 system-ui, sans-serif',
  color: '#ffffff',
  background: '#db2777',
  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

/** Puntos, línea y distancia de la herramienta de medición. */
export function MeasureOverlay({
  points,
  locale,
}: {
  readonly points: readonly MeasurePoint[];
  readonly locale: string;
}) {
  const world = points.map((p) => planToWorld(p, p.z));
  const [a, b] = points;
  return (
    <group name="measure">
      {world.map((p, i) => (
        <mesh key={i} position={p} renderOrder={10}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshBasicMaterial color="#db2777" depthTest={false} />
        </mesh>
      ))}
      {a && b && (
        <>
          <Line points={[world[0]!, world[1]!]} color="#db2777" lineWidth={3} depthTest={false} />
          <Html
            position={[
              (world[0]![0] + world[1]![0]) / 2,
              (world[0]![1] + world[1]![1]) / 2,
              (world[0]![2] + world[1]![2]) / 2,
            ]}
            center
            // Por debajo de los paneles de la aplicación (drei usa un z-index enorme por defecto).
            zIndexRange={[20, 0]}
            pointerEvents="none"
            style={{ pointerEvents: 'none' }}
          >
            <div style={labelStyle} data-testid="measure-label">
              {formatLength(measureDistance(a, b), locale)}
            </div>
          </Html>
        </>
      )}
    </group>
  );
}
