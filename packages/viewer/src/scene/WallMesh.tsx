import type { ResolvedMaterial, Wall, WallFootprint } from '@decodeny/domain';
import type { ThreeEvent } from '@react-three/fiber';
import { memo, useMemo } from 'react';
import { buildWallMesh, WALL_SLOTS, type WallCut } from '../builders/wall-mesh';
import { toBufferGeometry } from '../builders/to-buffer-geometry';
import { surfaceMaterial } from '../materials/default-materials';
import { defaultFinish, finishMaterial } from '../materials/finish-materials';
import type { InteractionState, SelectOptions, ViewerSelection } from '../selection';
import { pointsKey, useKeyedGeometry } from './use-keyed-geometry';
import { CLICK_DRAG_TOLERANCE_PX, isAdditiveClick } from './interaction';

interface WallMeshProps {
  readonly wall: Wall;
  readonly footprint: WallFootprint;
  readonly cuts: readonly WallCut[];
  /** Terminaciones de cada cara (sin terminación: pintura por defecto). */
  readonly leftFinish?: ResolvedMaterial | undefined;
  readonly rightFinish?: ResolvedMaterial | undefined;
  readonly state: InteractionState;
  readonly onSelect: (target: ViewerSelection, options?: SelectOptions) => void;
  readonly onHover: (target: ViewerSelection | null) => void;
}

export const WallMesh = memo(function WallMesh({
  wall,
  footprint,
  cuts,
  leftFinish,
  rightFinish,
  state,
  onSelect,
  onHover,
}: WallMeshProps) {
  const cutsKey = cuts.map((c) => `${c.offset},${c.width},${c.height},${c.sill}`).join(';');
  const key = `${pointsKey(footprint.polygon)}|${footprint.startShape.capped}|${footprint.endShape.capped}|${wall.height}|${cutsKey}`;
  const geometry = useKeyedGeometry(key, () =>
    toBufferGeometry(buildWallMesh(footprint, wall.height, cuts), WALL_SLOTS),
  );
  const materials = useMemo(() => {
    const side = surfaceMaterial('wallSide', state);
    // Orden = WALL_SLOTS: left, right, top, cap, reveal, threshold.
    return [
      finishMaterial(leftFinish ?? defaultFinish('wall'), state),
      finishMaterial(rightFinish ?? defaultFinish('wall'), state),
      surfaceMaterial('wallTop', state),
      side,
      side,
      surfaceMaterial('threshold', 'normal'),
    ];
  }, [leftFinish, rightFinish, state]);
  const target = useMemo<ViewerSelection>(() => ({ kind: 'wall', id: wall.id }), [wall.id]);
  /** La cara clicada indica desde qué recinto se mira el muro (slots 0 = left, 1 = right). */
  const faceOf = (e: ThreeEvent<MouseEvent>): ViewerSelection => {
    const slot = WALL_SLOTS[e.face?.materialIndex ?? -1];
    return slot === 'left' || slot === 'right' ? { kind: 'wall', id: wall.id, face: slot } : target;
  };

  return (
    <mesh
      name={`wall:${wall.id}`}
      geometry={geometry}
      material={materials}
      castShadow
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > CLICK_DRAG_TOLERANCE_PX) return;
        e.stopPropagation();
        onSelect(faceOf(e), { additive: isAdditiveClick(e.nativeEvent) });
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(target);
      }}
      onPointerOut={() => onHover(null)}
    />
  );
});
