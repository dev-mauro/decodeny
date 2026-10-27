import { moveRoom, roundVec, snapRoomTranslation } from '@decodeny/domain';
import type { RoomDragEvent } from '@decodeny/viewer';
import { useCallback } from 'react';
import { useProjectStore } from '@/state/project-store';
import { activeLevel, snapStep, useUiStore } from '@/state/ui-store';

/**
 * Convierte el arrastre de un recinto en la vista en una transacción: se previsualiza en cada
 * movimiento (con ajuste a los muros vecinos) y al soltar queda como un solo paso de deshacer.
 */
export function useRoomDragHandler(): (event: RoomDragEvent) => void {
  return useCallback((event: RoomDragEvent) => {
    const store = useProjectStore.getState();
    const ui = useUiStore.getState();
    if (event.phase === 'cancel') {
      store.cancelPreview();
      ui.setHighlighted([]);
      return;
    }
    const base = store.transaction?.base ?? store.project;
    const level = activeLevel(base, ui.levelId);
    const snap = event.snap
      ? snapRoomTranslation(level, event.roomId, event.delta, undefined, snapStep())
      : { delta: roundVec(event.delta), wallIds: [] };
    store.preview(moveRoom, {
      levelId: level.id,
      roomId: event.roomId,
      dx: snap.delta.x,
      dy: snap.delta.y,
    });
    if (event.phase === 'end') {
      useProjectStore.getState().commitPreview();
      ui.setHighlighted([]);
    } else {
      ui.setHighlighted(snap.wallIds.map((id) => ({ kind: 'wall', id })));
    }
  }, []);
}
