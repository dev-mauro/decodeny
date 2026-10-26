import { openingEnvelope, openingOffsetRange, updateOpening } from '@decodeny/domain';
import type { OpeningDragEvent } from '@decodeny/viewer';
import { useCallback } from 'react';
import { useProjectStore } from '@/state/project-store';
import { activeLevel, useUiStore } from '@/state/ui-store';

/** Paso del arrastre de vanos (mm); con Alt, sin redondeo. */
const STEP = 10;

/**
 * Arrastre de una puerta o ventana a lo largo de su muro: se previsualiza en cada movimiento,
 * se detiene en los extremos libres del muro y queda como un solo paso de deshacer.
 */
export function useOpeningDragHandler(): (event: OpeningDragEvent) => void {
  return useCallback((event: OpeningDragEvent) => {
    const store = useProjectStore.getState();
    if (event.phase === 'cancel') {
      store.cancelPreview();
      return;
    }
    const base = store.transaction?.base ?? store.project;
    const level = activeLevel(base, useUiStore.getState().levelId);
    const opening = level.openings.find((o) => o.id === event.openingId);
    if (!opening) return;
    const range = openingOffsetRange(level, opening.wallId, openingEnvelope(opening).width);
    let offset = opening.offset + event.along;
    if (event.snap) offset = Math.round(offset / STEP) * STEP;
    if (range) offset = Math.min(range.end, Math.max(range.start, offset));
    store.preview(updateOpening, { levelId: level.id, openingId: opening.id, offset });
    if (event.phase === 'end') useProjectStore.getState().commitPreview();
  }, []);
}
