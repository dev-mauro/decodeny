import { pointInPolygon, roomInteriorPolygon } from '@decodeny/domain';
import type { PlacementEvent } from '@decodeny/viewer';
import { i18next } from '@/i18n';
import { notify } from '@/state/notifications-store';
import { useProjectStore } from '@/state/project-store';
import { activeLevel, useUiStore } from '@/state/ui-store';

/**
 * Elegir dónde empieza el recorrido: usa la ubicación con el puntero de las vistas (ADR-0010).
 * Un clic en el piso de un recinto empieza el recorrido ahí; fuera de los recintos, avisa.
 */
export function handleWalkStartEvent(event: PlacementEvent): void {
  if (event.phase !== 'end') return;
  const ui = useUiStore.getState();
  const level = activeLevel(useProjectStore.getState().project, ui.levelId);
  const inside = level.rooms.some((room) =>
    pointInPolygon(event.point, roomInteriorPolygon(level, room)),
  );
  if (!inside) {
    notify('error', i18next.t('navigation.startOutside'));
    return;
  }
  ui.walkFrom({ x: Math.round(event.point.x), y: Math.round(event.point.y) });
}
