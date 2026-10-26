import { resolveItemDefinition } from '@decodeny/catalog';
import {
  buildItemParts,
  definitionEnvelope,
  resolveParams,
  type Item,
  type ItemWarning,
} from '@decodeny/domain';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { memo, useMemo } from 'react';
import { planToWorld } from '../coords';
import { itemMaterial } from '../materials/default-materials';
import { pictureMaterial, usePictureTexture } from '../materials/picture-materials';
import type { InteractionState, ViewerSelection } from '../selection';
import { CLICK_DRAG_TOLERANCE_PX } from './interaction';
import { PartMeshes } from './PartMeshes';

interface ItemViewProps {
  readonly item: Item;
  readonly state: InteractionState;
  /** Aviso de ubicación (superposición o muro): se marca la huella en rojo. */
  readonly warning: ItemWarning | undefined;
  /** Altura de la base (mm sobre el nivel): los de cielo cuelgan del cielo de su recinto. */
  readonly base: number;
  /** URL de las imágenes del usuario por id de asset (cuadros). */
  readonly assetUrl?: ((assetId: string) => string | undefined) | undefined;
  /** Huella en el piso (edición). */
  readonly showFootprint: boolean;
  readonly onSelect: (target: ViewerSelection) => void;
  readonly onHover: (target: ViewerSelection | null) => void;
  readonly onDragStart?: ((itemId: string, e: ThreeEvent<PointerEvent>) => void) | undefined;
}

const FOOTPRINT_HEIGHT = 0.008;

/**
 * Mueble generado por su definición de catálogo. El marco local del catálogo (x a lo ancho,
 * z con el frente en +z) coincide con el de Three; el grupo se gira según la rotación en planta.
 */
export const ItemView = memo(function ItemView({
  item,
  state,
  warning,
  base,
  assetUrl,
  showFootprint,
  onSelect,
  onHover,
  onDragStart,
}: ItemViewProps) {
  const definition = resolveItemDefinition(item.def);
  const { parts, envelope, lit, imageId } = useMemo(() => {
    const params = resolveParams(definition.params, item.params);
    const image = Object.entries(definition.params).find(([, spec]) => spec.kind === 'image');
    return {
      parts: buildItemParts(definition, params),
      envelope: definitionEnvelope(definition, params),
      lit: (definition.emitters?.(params).length ?? 0) > 0,
      imageId: image ? String(params[image[0]] ?? '') : '',
    };
  }, [definition, item.params]);
  const picture = usePictureTexture(imageId ? assetUrl?.(imageId) : undefined);
  const target = useMemo<ViewerSelection>(() => ({ kind: 'item', id: item.id }), [item.id]);

  const outline = useMemo(() => {
    const w = envelope.width / 2000;
    const d = envelope.depth / 2000;
    return {
      rect: [
        [-w, FOOTPRINT_HEIGHT, -d],
        [w, FOOTPRINT_HEIGHT, -d],
        [w, FOOTPRINT_HEIGHT, d],
        [-w, FOOTPRINT_HEIGHT, d],
        [-w, FOOTPRINT_HEIGHT, -d],
      ] as [number, number, number][],
      // Marca del frente: un trazo corto hacia afuera en el centro del borde frontal.
      front: [
        [0, FOOTPRINT_HEIGHT, d],
        [0, FOOTPRINT_HEIGHT, d + 0.12],
      ] as [number, number, number][],
    };
  }, [envelope.depth, envelope.width]);
  const outlineColor = warning ? '#dc2626' : state === 'selected' ? '#2563eb' : '#60a5fa';
  const showOutline = showFootprint && (warning !== undefined || state !== 'normal');

  return (
    <group
      name={`item:${item.id}`}
      position={planToWorld(item.position, base)}
      rotation-y={(item.rotation * Math.PI) / 180}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > CLICK_DRAG_TOLERANCE_PX) return;
        e.stopPropagation();
        onSelect(target);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(target);
      }}
      onPointerOut={() => onHover(null)}
      {...(onDragStart
        ? { onPointerDown: (e: ThreeEvent<PointerEvent>) => onDragStart(item.id, e) }
        : {})}
    >
      <PartMeshes
        parts={parts}
        materialOf={(slot, color) =>
          slot === 'picture'
            ? pictureMaterial(picture, state)
            : itemMaterial(slot, state, color, lit)
        }
        castShadow={(slot) => slot !== 'glass' && slot !== 'water'}
      />
      {showOutline && (
        <>
          <Line points={outline.rect} color={outlineColor} lineWidth={2} />
          <Line points={outline.front} color={outlineColor} lineWidth={2} />
        </>
      )}
    </group>
  );
});
