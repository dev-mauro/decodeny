import { moveNode, snapNodePosition } from '@decodeny/domain';
import type { NodeDragEvent } from '@decodeny/viewer';
import { useCallback } from 'react';
import { useProjectStore } from '@/state/project-store';
import { activeLevel, useUiStore } from '@/state/ui-store';

/**
 * Arrastre de un vértice en la planta: se alinea con sus vecinos (muros a escuadra) o con la
 * grilla de 1 cm (Alt: libre), se previsualiza y queda como un solo paso de deshacer. Si la
 * forma resultante no es válida (el contorno se cruza), se conserva la última válida.
 */
export function useNodeDragHandler(): (event: NodeDragEvent) => void {
  return useCallback((event: NodeDragEvent) => {
    const store = useProjectStore.getState();
    if (event.phase === 'cancel') {
      store.cancelPreview();
      return;
    }
    const base = store.transaction?.base ?? store.project;
    const level = activeLevel(base, useUiStore.getState().levelId);
    const p = event.snap
      ? snapNodePosition(level, event.nodeId, event.position)
      : { x: Math.round(event.position.x), y: Math.round(event.position.y) };
    store.preview(moveNode, { levelId: level.id, nodeId: event.nodeId, x: p.x, y: p.y });
    if (event.phase === 'end') useProjectStore.getState().commitPreview();
  }, []);
}
