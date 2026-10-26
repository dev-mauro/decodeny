import { addWall, deleteWall, detectRooms, type Vec2 } from '@decodeny/domain';
import { i18next } from '@/i18n';
import { notify } from '@/state/notifications-store';
import { useProjectStore } from '@/state/project-store';
import { runCommand } from '@/state/use-command';
import { activeLevel, useUiStore } from '@/state/ui-store';

const levelId = () =>
  activeLevel(useProjectStore.getState().project, useUiStore.getState().levelId).id;

const roomName = () => i18next.t('rooms.baseName');

function announceRooms(count: number): void {
  if (count > 0) notify('success', i18next.t('viewport.roomsDetected', { count }));
}

/** Dibuja un tramo de muro en la planta; si cierra contornos, crea sus recintos. */
export function drawWall(from: Vec2, to: Vec2): void {
  const out = runCommand(addWall, { levelId: levelId(), from, to, roomName: roomName() });
  if (out.ok) announceRooms(out.result.roomIds.length);
}

export function deleteSelectedWall(): boolean {
  const { selection } = useUiStore.getState();
  if (selection?.kind !== 'wall') return false;
  const out = runCommand(deleteWall, {
    levelId: levelId(),
    wallId: selection.id,
    roomName: roomName(),
  });
  if (out.ok) {
    notify('info', i18next.t('inspector.wallDeleted'), {
      label: i18next.t('notifications.undo'),
      run: () => useProjectStore.getState().undo(),
    });
  }
  return out.ok;
}

/** Crea recintos en los contornos cerrados de muros que aún no lo son. */
export function detectRoomsFromWalls(): void {
  const out = runCommand(detectRooms, { levelId: levelId(), roomName: roomName() });
  if (!out.ok) return;
  if (out.result.roomIds.length === 0) notify('info', i18next.t('viewport.noRoomsDetected'));
  else announceRooms(out.result.roomIds.length);
}
