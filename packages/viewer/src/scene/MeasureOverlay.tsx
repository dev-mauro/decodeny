import { formatLength } from '@decodeny/domain';
import { Html, Line } from '@react-three/drei';
import type { CSSProperties } from 'react';
import { planToWorld } from '../coords';

import { measureDistance, type MeasurePoint } from './measure';

export const MEASURE_COLOR = '#db2777';

const labelStyle: CSSProperties = {
  padding: '3px 8px',
  borderRadius: 8,
  font: '700 13px/1.3 system-ui, sans-serif',
  color: '#ffffff',
  background: MEASURE_COLOR,
  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

/**
 * Un tramo medido con su largo: fijo (entre dos puntos marcados) o, mientras se elige el segundo
 * punto, punteado hasta el puntero (como en el plano).
 */
export function MeasureSegment({
  a,
  b,
  live = false,
  locale,
}: {
  readonly a: MeasurePoint;
  readonly b: MeasurePoint;
  readonly live?: boolean;
  readonly locale: string;
}) {
  const wa = planToWorld(a, a.z);
  const wb = planToWorld(b, b.z);
  return (
    <group name="measure">
      <Line
        points={[wa, wb]}
        color={MEASURE_COLOR}
        lineWidth={live ? 2 : 3}
        dashed={live}
        dashSize={0.08}
        gapSize={0.05}
        depthTest={false}
      />
      <Html
        position={[(wa[0] + wb[0]) / 2, (wa[1] + wb[1]) / 2, (wa[2] + wb[2]) / 2]}
        center
        // Por debajo de los paneles de la aplicación (drei usa un z-index enorme por defecto).
        zIndexRange={[20, 0]}
        pointerEvents="none"
        style={{ pointerEvents: 'none' }}
      >
        <div style={labelStyle} data-testid={live ? 'measure-live-label' : 'measure-label'}>
          {formatLength(measureDistance(a, b), locale)}
        </div>
      </Html>
    </group>
  );
}

/** Puntos, línea y distancia de la herramienta de medición. */
export function MeasureOverlay({
  points,
  locale,
}: {
  readonly points: readonly MeasurePoint[];
  readonly locale: string;
}) {
  const [a, b] = points;
  return (
    <group name="measure">
      {points.map((p, i) => (
        <mesh key={i} position={planToWorld(p, p.z)} renderOrder={10}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshBasicMaterial color={MEASURE_COLOR} depthTest={false} />
        </mesh>
      ))}
      {a && b && <MeasureSegment a={a} b={b} locale={locale} />}
    </group>
  );
}
