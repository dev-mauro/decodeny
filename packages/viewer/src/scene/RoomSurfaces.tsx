import type { ResolvedMaterial, Room, Vec2 } from '@decodeny/domain';
import type { ThreeEvent } from '@react-three/fiber';
import { memo, useMemo } from 'react';
import { buildSurfaceMesh } from '../builders/surface-mesh';
import { toBufferGeometry } from '../builders/to-buffer-geometry';
import { defaultFinish, finishMaterial } from '../materials/finish-materials';
import type { InteractionState, SelectOptions, ViewerSelection } from '../selection';
import { CLICK_DRAG_TOLERANCE_PX, isAdditiveClick } from './interaction';
import { pointsKey, useKeyedGeometry } from './use-keyed-geometry';

interface RoomSurfacesProps {
  readonly room: Room;
  readonly interior: readonly Vec2[];
  readonly ceilingHeight: number;
  readonly floorFinish?: ResolvedMaterial | undefined;
  readonly ceilingFinish?: ResolvedMaterial | undefined;
  readonly state: InteractionState;
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
  floorFinish,
  ceilingFinish,
  state,
  onSelect,
  onHover,
  onDragStart,
}: RoomSurfacesProps) {
  const outline = pointsKey(interior);
  const floor = useKeyedGeometry(outline, () =>
    toBufferGeometry(buildSurfaceMesh(interior, 0, 'up'), SURFACE_SLOTS),
  );
  const ceiling = useKeyedGeometry(`${outline}|${ceilingHeight}`, () =>
    toBufferGeometry(buildSurfaceMesh(interior, ceilingHeight, 'down'), SURFACE_SLOTS),
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
      {/* Solo visible desde abajo; no proyecta sombra para no oscurecer el interior. */}
      <mesh
        geometry={ceiling}
        material={finishMaterial(ceilingFinish ?? defaultFinish('ceiling'), 'normal')}
        receiveShadow
      />
    </group>
  );
});
