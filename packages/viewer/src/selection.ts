import type { WallFace } from '@decodeny/domain';

/** Entidad seleccionable en el visor. */
export type ViewerSelection =
  | { readonly kind: 'room'; readonly id: string }
  | {
      readonly kind: 'wall';
      readonly id: string;
      /** Cara por la que se eligió el muro: indica desde qué recinto se mira. */
      readonly face?: WallFace;
    }
  | { readonly kind: 'opening'; readonly id: string }
  | { readonly kind: 'item'; readonly id: string };

export type InteractionState = 'normal' | 'hover' | 'selected';

/** Cómo se eligió algo: con Shift, Ctrl o Cmd el clic suma o quita de la selección. */
export interface SelectOptions {
  readonly additive: boolean;
}

/** Recuadro de selección en la planta (mm); `additive` si se suma a la selección actual. */
export interface AreaSelectEvent {
  readonly min: { readonly x: number; readonly y: number };
  readonly max: { readonly x: number; readonly y: number };
  readonly additive: boolean;
}

const inGroup = (target: ViewerSelection, group: readonly ViewerSelection[]) =>
  group.some((g) => sameSelection(target, g));

export const sameSelection = (a: ViewerSelection | null, b: ViewerSelection | null): boolean =>
  a?.kind === b?.kind && a?.id === b?.id;

export function interactionState(
  target: ViewerSelection,
  selection: ViewerSelection | null,
  hovered: ViewerSelection | null,
  highlighted: readonly ViewerSelection[] = [],
  group: readonly ViewerSelection[] = [],
): InteractionState {
  if (sameSelection(target, selection) || inGroup(target, group)) return 'selected';
  if (sameSelection(target, hovered) || inGroup(target, highlighted)) {
    return 'hover';
  }
  return 'normal';
}

/** Arrastre de un recinto en el plano del nivel (desplazamiento acumulado en mm de planta). */
export interface RoomDragEvent {
  readonly phase: 'move' | 'end' | 'cancel';
  readonly roomId: string;
  readonly delta: { readonly x: number; readonly y: number };
  /** `false` mientras se mantiene Alt: sin ajuste a muros ni grilla. */
  readonly snap: boolean;
}

/** Arrastre de una puerta o ventana a lo largo de su muro (mm acumulados en dirección start → end). */
export interface OpeningDragEvent {
  readonly phase: 'move' | 'end' | 'cancel';
  readonly openingId: string;
  readonly along: number;
  readonly snap: boolean;
}

/** Arrastre de un mueble sobre el piso (desplazamiento acumulado en mm de planta). */
export interface ItemDragEvent {
  readonly phase: 'move' | 'end' | 'cancel';
  readonly itemId: string;
  readonly delta: { readonly x: number; readonly y: number };
  readonly snap: boolean;
}

/** Ubicación con el puntero de algo nuevo (p. ej. un mueble recién elegido del catálogo). */
export interface PlacementEvent {
  /** `move`: el puntero se movió sobre la vista; `end`: clic para dejarlo ahí. */
  readonly phase: 'move' | 'end';
  /** Punto bajo el puntero en planta (mm). */
  readonly point: { readonly x: number; readonly y: number };
  /** `false` mientras se mantiene Alt: sin ajuste a muros ni grilla. */
  readonly snap: boolean;
}

/**
 * Sesión de ubicación: mientras está activa, la vista no selecciona ni resalta; informa la
 * posición del puntero y el clic. La aplicación decide el ajuste y muestra la vista previa.
 */
export interface ViewerPlacement {
  /** Altura (mm sobre el nivel) del plano donde se proyecta el puntero en 3D. */
  readonly height: number;
  readonly onEvent: (event: PlacementEvent) => void;
}
