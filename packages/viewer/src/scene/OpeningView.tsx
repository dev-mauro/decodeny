import { resolveOpeningDefinition } from '@decodeny/catalog';
import {
  add,
  angleOf,
  resolveParams,
  scale,
  type Opening,
  type WallFootprint,
} from '@decodeny/domain';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { memo, useMemo } from 'react';
import { planToWorld } from '../coords';
import { openingMaterial } from '../materials/default-materials';
import type { InteractionState, SelectOptions, ViewerSelection } from '../selection';
import { CLICK_DRAG_TOLERANCE_PX, isAdditiveClick } from './interaction';
import { PartMeshes } from './PartMeshes';

interface OpeningViewProps {
  readonly opening: Opening;
  readonly footprint: WallFootprint;
  readonly state: InteractionState;
  /** Símbolos de planta (arcos de apertura): solo en edición. */
  readonly showPlan: boolean;
  readonly onSelect: (target: ViewerSelection, options?: SelectOptions) => void;
  readonly onHover: (target: ViewerSelection | null) => void;
  readonly onDragStart?:
    | ((openingId: string, footprint: WallFootprint, e: ThreeEvent<PointerEvent>) => void)
    | undefined;
}

const PLAN_HEIGHT = 0.012;

/**
 * Puerta o ventana generada por su definición de catálogo. El marco local del catálogo
 * (x a lo largo del muro, z hacia la cara izquierda) se mapea a un grupo girado según el muro;
 * en Three la cara izquierda queda en −Z local.
 */
export const OpeningView = memo(function OpeningView({
  opening,
  footprint,
  state,
  showPlan,
  onSelect,
  onHover,
  onDragStart,
}: OpeningViewProps) {
  const definition = resolveOpeningDefinition(opening.def);
  const { parts, strokes } = useMemo(() => {
    const params = resolveParams(definition.params, opening.params);
    const ctx = { wallThickness: footprint.thickness };
    return { parts: definition.build(params, ctx), strokes: definition.plan?.(params, ctx) ?? [] };
  }, [definition, footprint.thickness, opening.params]);
  const center = planToWorld(add(footprint.start, scale(footprint.dir, opening.offset)));
  const target = useMemo<ViewerSelection>(
    () => ({ kind: 'opening', id: opening.id }),
    [opening.id],
  );

  return (
    <group
      name={`opening:${opening.id}`}
      position={center}
      rotation-y={angleOf(footprint.dir)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > CLICK_DRAG_TOLERANCE_PX) return;
        e.stopPropagation();
        onSelect(target, { additive: isAdditiveClick(e.nativeEvent) });
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(target);
      }}
      onPointerOut={() => onHover(null)}
      {...(onDragStart
        ? {
            onPointerDown: (e: ThreeEvent<PointerEvent>) => onDragStart(opening.id, footprint, e),
          }
        : {})}
    >
      <PartMeshes
        parts={parts}
        materialOf={(slot) => openingMaterial(slot, state)}
        zSign={-1}
        castShadow={(slot) => slot !== 'glass'}
      />
      {showPlan &&
        strokes.map((stroke, i) => (
          <Line
            key={`plan-${i}`}
            points={stroke.points.map(([x, z]) => [x / 1000, PLAN_HEIGHT, -z / 1000] as const)}
            color={state === 'normal' ? '#64748b' : '#2563eb'}
            lineWidth={1.5}
            dashed={stroke.dashed ?? false}
            dashSize={0.06}
            gapSize={0.04}
          />
        ))}
    </group>
  );
});
