import { moveItems, updateItem } from '@decodeny/domain';
import type { ItemDragEvent } from '@decodeny/viewer';
import { useCallback } from 'react';
import { useProjectStore } from '@/state/project-store';
import { activeLevel, useUiStore } from '@/state/ui-store';
import { selectedTargets } from '@/state/selection-model';
import { itemPlacementAt } from './item-placement';

/**
 * Arrastre de muebles: se previsualiza en cada movimiento con el ajuste de su montaje (ver
 * `itemPlacementAt`); Alt lo desactiva. Si el mueble es parte de una selección múltiple, se
 * mueve todo el grupo con la grilla de 1 cm (sin girar contra muros, para no deformarlo). Al
 * soltar queda como un solo paso de deshacer.
 */
export function useItemDragHandler(): (event: ItemDragEvent) => void {
  return useCallback((event: ItemDragEvent) => {
    const store = useProjectStore.getState();
    if (event.phase === 'cancel') {
      store.cancelPreview();
      return;
    }
    const base = store.transaction?.base ?? store.project;
    const level = activeLevel(base, useUiStore.getState().levelId);
    const item = level.items.find((i) => i.id === event.itemId);
    if (!item) return;
    const group = selectedTargets(useUiStore.getState())
      .filter((t) => t.kind === 'item')
      .map((t) => t.id);
    if (group.length > 1 && group.includes(item.id)) {
      const round = (v: number) => (event.snap ? Math.round(v / 10) * 10 : v);
      store.preview(moveItems, {
        levelId: level.id,
        itemIds: group,
        delta: { x: round(event.delta.x), y: round(event.delta.y) },
      });
      if (event.phase === 'end') useProjectStore.getState().commitPreview();
      return;
    }
    const center = { x: item.position.x + event.delta.x, y: item.position.y + event.delta.y };
    const placed = itemPlacementAt(level, item, center, event.snap);
    store.preview(updateItem, {
      levelId: level.id,
      itemId: item.id,
      position: placed.position,
      rotation: placed.rotation,
    });
    if (event.phase === 'end') useProjectStore.getState().commitPreview();
  }, []);
}
