import type { ResolvedMaterial, Room, Vec2 } from '@decodeny/domain';
import type { ThreeEvent } from '@react-three/fiber';
import { memo, useMemo } from 'react';
import { buildRegionsMesh } from '../builders/surface-mesh';
import { toBufferGeometry } from '../builders/to-buffer-geometry';
import { defaultFinish, finishMaterial } from '../materials/finish-materials';
import type { InteractionState, SelectOptions, ViewerSelection } from '../selection';
import { CLICK_DRAG_TOLERANCE_PX, isAdditiveClick } from './interaction';
import { NO_VOIDS, subtractVoids, voidsKey } from './slabs';
import { pointsKey, useKeyedGeometry } from './use-keyed-geometry';

interface RoomSurfacesProps {
  readonly room: Room;
  readonly interior: readonly Vec2[];
  readonly ceilingHeight: number;
  /** Huecos del piso y del cielo (escaleras entre plantas), en planta. */
  readonly floorVoids?: readonly (readonly Vec2[])[] | undefined;
  readonly ceilingVoids?: readonly (readonly Vec2[])[] | undefined;
  readonly floorFinish?: ResolvedMaterial | undefined;
  readonly ceilingFinish?: ResolvedMaterial | undefined;
  readonly state: InteractionState;
  /** Recorrido y vuelo: el cielo tapa el sol (entra solo por las ventanas). En edición, no. */
  readonly ceilingShadows?: boolean | undefined;
  readonly onSelect: (target: ViewerSelection, options?: SelectOptions) => void;
  readonly onHover: (target: ViewerSelection | null) => void;
  /** Si está definido, arrastrar el piso mueve el recinto. */
  readonly onDragStart?: ((roomId: string, e: ThreeEvent<PointerEvent>) => void) | undefined;
}

const SURFACE_SLOTS = ['surface'] as const;

export const RoomSurfaces = memo(function RoomSurfaces({
  room,
  interior,
  ceilingHeight,
  floorVoids = NO_VOIDS,
  ceilingVoids = NO_VOIDS,
  floorFinish,
  ceilingFinish,
  state,
  ceilingShadows = false,
  onSelect,
  onHover,
  onDragStart,
}: RoomSurfacesProps) {
  const outline = pointsKey(interior);
  const floor = useKeyedGeometry(`${outline}|${voidsKey(floorVoids)}`, () =>
    toBufferGeometry(buildRegionsMesh(subtractVoids(interior, floorVoids), 0, 'up'), SURFACE_SLOTS),
  );
  const ceiling = useKeyedGeometry(`${outline}|${ceilingHeight}|${voidsKey(ceilingVoids)}`, () =>
    toBufferGeometry(
      buildRegionsMesh(subtractVoids(interior, ceilingVoids), ceilingHeight, 'down'),
      SURFACE_SLOTS,
    ),
  );
  const target = useMemo<ViewerSelection>(() => ({ kind: 'room', id: room.id }), [room.id]);

  return (
    <group name={`room:${room.id}`}>
      <mesh
        geometry={floor}
        material={finishMaterial(floorFinish ?? defaultFinish('floor'), state, true)}
        receiveShadow
        {...(onDragStart
          ? { onPointerDown: (e: ThreeEvent<PointerEvent>) => onDragStart(room.id, e) }
          : {})}
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
      />
      {/* Solo visible desde abajo. En edición no proyecta sombra (se ve la casa por arriba, como
          una maqueta); en el recorrido sí, y el sol entra solo por las ventanas. */}
      <mesh
        geometry={ceiling}
        material={finishMaterial(ceilingFinish ?? defaultFinish('ceiling'), 'normal')}
        castShadow={ceilingShadows}
        receiveShadow
      />
    </group>
  );
});
