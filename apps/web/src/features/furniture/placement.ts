import { resolveItemDefinition } from '@decodeny/catalog';
import { addItem, createId, type AnyItemDefinition, type Vec2 } from '@decodeny/domain';
import type { PlacementEvent } from '@decodeny/viewer';
import { describeDomainError } from '@/shared/lib/errors';
import { notify } from '@/state/notifications-store';
import { useProjectStore } from '@/state/project-store';
import { activeLevel, useUiStore, type ItemPlacementSession } from '@/state/ui-store';
import { initialItemSpot } from './item-actions';
import { itemPlacementAt } from './item-placement';

/**
 * Ubicación de items nuevos con el puntero. Elegir un item del catálogo abre una sesión: el item
 * aparece como vista previa (en el lugar sugerido del recinto activo) y sigue al puntero en la
 * vista 3D o en la planta con el mismo ajuste que al arrastrarlo. Un clic lo deja ahí, Enter lo
 * deja donde está, R lo gira y Esc cancela. Al confirmar queda como un solo paso de deshacer.
 *
 * La vista previa es una transacción del documento (`preview`) que repite `addItem` con el mismo
 * id; cualquier otra edición la cierra y con ella termina la ubicación (ver `ui-store`).
 */

/** Altura típica de una cubierta (mesa, escritorio) para proyectar el puntero en 3D. */
const SURFACE_POINTER_HEIGHT = 750;

const levelBase = () => {
  const store = useProjectStore.getState();
  return activeLevel(store.transaction?.base ?? store.project, useUiStore.getState().levelId);
};

/** Muestra el item de la sesión en `point` (o donde está) con el ajuste de su montaje. */
function show(session: ItemPlacementSession, at: { point: Vec2; snap: boolean } | null): boolean {
  const level = levelBase();
  const item = {
    id: session.itemId,
    def: session.def,
    params: session.params,
    rotation: session.rotation,
  };
  const placed = at ? itemPlacementAt(level, item, at.point, at.snap) : null;
  const current = activeLevel(useProjectStore.getState().project, level.id).items.find(
    (i) => i.id === session.itemId,
  );
  const position = placed?.position ?? current?.position;
  if (!position) return false;
  const out = useProjectStore.getState().preview(addItem, {
    levelId: level.id,
    def: session.def,
    params: session.params,
    position: { x: position.x, y: position.y, z: position.z ?? session.z },
    rotation: placed?.rotation ?? session.rotation,
    id: session.itemId,
  });
  return out.ok;
}

/** Empieza a ubicar un item del catálogo (reemplaza una ubicación en curso). */
export function startPlacement(definition: AnyItemDefinition): void {
  cancelPlacement();
  const ui = useUiStore.getState();
  if (ui.navigationMode !== 'edit') ui.setNavigationMode('edit');
  if (ui.planTool !== 'select') ui.setPlanTool('select');
  if (ui.measuring) ui.setMeasuring(false);
  const store = useProjectStore.getState();
  store.cancelPreview();
  const level = activeLevel(store.project, ui.levelId);
  const spot = initialItemSpot(level, definition);
  const session: ItemPlacementSession = {
    itemId: createId('item'),
    def: definition.id,
    params: spot.params,
    rotation: spot.rotation,
    z: spot.position.z,
    pointerHeight:
      definition.mount === 'wall'
        ? spot.position.z
        : definition.mount === 'surface'
          ? SURFACE_POINTER_HEIGHT
          : 0,
    pointer: null,
  };
  const out = store.preview(addItem, {
    levelId: level.id,
    def: definition.id,
    params: spot.params,
    position: spot.position,
    rotation: spot.rotation,
    id: session.itemId,
  });
  if (!out.ok) {
    store.cancelPreview();
    notify('error', describeDomainError(out.error));
    return;
  }
  ui.select(null);
  ui.setPlacement(session);
}

/** Lleva el item en ubicación al punto del puntero. */
export function movePlacement(point: Vec2, snap: boolean): void {
  const session = useUiStore.getState().placement;
  if (!session) return;
  const pointer = { point, snap };
  if (show(session, pointer)) useUiStore.getState().setPlacement({ ...session, pointer });
}

/** Deja el item (en `point`, si se indica, o donde está) y lo selecciona. */
export function confirmPlacement(point?: Vec2, snap = true): void {
  if (point) movePlacement(point, snap);
  const session = useUiStore.getState().placement;
  if (!session) return;
  useUiStore.getState().setPlacement(null);
  useProjectStore.getState().commitPreview();
  useUiStore.getState().select({ kind: 'item', id: session.itemId });
}

export function cancelPlacement(): void {
  if (!useUiStore.getState().placement) return;
  useUiStore.getState().setPlacement(null);
  useProjectStore.getState().cancelPreview();
}

/** Gira el item en ubicación (los de muro siguen mirando al recinto). */
export function rotatePlacement(degrees: number): void {
  const session = useUiStore.getState().placement;
  if (!session || resolveItemDefinition(session.def).mount === 'wall') return;
  const next = { ...session, rotation: session.rotation + degrees };
  if (show(next, next.pointer)) useUiStore.getState().setPlacement(next);
}

/** Eventos de ubicación de las vistas (3D y planta). */
export function handlePlacementEvent(event: PlacementEvent): void {
  if (event.phase === 'end') confirmPlacement(event.point, event.snap);
  else movePlacement(event.point, event.snap);
}

// Recorrer o volar no permite ubicar: la ubicación en curso se cancela.
useUiStore.subscribe((state) => {
  if (state.placement && state.navigationMode !== 'edit') cancelPlacement();
});
