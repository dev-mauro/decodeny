import {
  add,
  formatLength,
  isCounterClockwise,
  lerp,
  normalize,
  perpLeft,
  scale,
  sub,
  type Vec2,
} from '@decodeny/domain';
import { Html, Line } from '@react-three/drei';
import { memo, useMemo, type CSSProperties } from 'react';
import { planToWorld } from '../coords';

export interface DimensionSide {
  readonly start: Vec2;
  readonly end: Vec2;
  readonly length: number;
}

interface RoomDimensionsProps {
  readonly interior: readonly Vec2[];
  readonly sides: readonly DimensionSide[];
  /** Lado resaltado (p. ej. el del muro seleccionado). */
  readonly highlightSide?: number | undefined;
  /** Lado bajo el puntero (en la vista o en el panel): resaltado suave. */
  readonly hoverSide?: number | undefined;
  readonly locale: string;
}

/** Separación de la etiqueta hacia el interior del recinto (mm). */
const LABEL_INSET = 280;
const LINE_HEIGHT = 8;

type LabelTone = 'normal' | 'hover' | 'highlight';

const TONES: Record<LabelTone, { color: string; background: string; border: string }> = {
  normal: { color: '#1f2937', background: 'rgba(255,255,255,0.92)', border: '#d1d5db' },
  hover: { color: '#1d4ed8', background: '#dbeafe', border: '#93c5fd' },
  highlight: { color: '#ffffff', background: '#2563eb', border: '#1d4ed8' },
};

const labelStyle = (tone: LabelTone): CSSProperties => ({
  padding: '2px 6px',
  borderRadius: 6,
  font: '600 12px/1.3 system-ui, sans-serif',
  whiteSpace: 'nowrap',
  color: TONES[tone].color,
  background: TONES[tone].background,
  border: `1px solid ${TONES[tone].border}`,
  boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
  pointerEvents: 'none',
  userSelect: 'none',
});

/** Cotas interiores de un recinto: contorno y largo de cada lado. */
export const RoomDimensions = memo(function RoomDimensions({
  interior,
  sides,
  highlightSide,
  hoverSide,
  locale,
}: RoomDimensionsProps) {
  const edges = useMemo(() => {
    const inwardSign = isCounterClockwise(interior) ? 1 : -1;
    return sides.map((side, i) => {
      const inward = scale(
        perpLeft(normalize(sub(side.end, side.start))),
        inwardSign * LABEL_INSET,
      );
      return {
        index: i,
        length: side.length,
        label: planToWorld(add(lerp(side.start, side.end, 0.5), inward), LINE_HEIGHT),
      };
    });
  }, [interior, sides]);
  const outline = useMemo(
    () => [...interior, interior[0]!].map((p) => planToWorld(p, LINE_HEIGHT)),
    [interior],
  );

  return (
    <group name="room-dimensions">
      <Line points={outline} color="#2563eb" lineWidth={2} dashed dashSize={0.15} gapSize={0.08} />
      {edges.map((edge) => (
        // Las etiquetas no deben tapar clics a la escena (p. ej. una puerta bajo la cota).
        <Html
          key={edge.index}
          position={edge.label}
          center
          zIndexRange={[20, 0]}
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
        >
          <div
            data-testid="dimension-label"
            style={labelStyle(
              edge.index === highlightSide
                ? 'highlight'
                : edge.index === hoverSide
                  ? 'hover'
                  : 'normal',
            )}
          >
            {formatLength(edge.length, locale)}
          </div>
        </Html>
      ))}
    </group>
  );
});
