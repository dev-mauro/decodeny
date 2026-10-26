import {
  roomOnWallFace,
  roomsOfWall,
  wallFaceTowardRoom,
  wallSideLabel,
  type Level,
  type Room,
  type Wall,
} from '@decodeny/domain';
import type { ViewerSelection } from '@decodeny/viewer';
import type { TFunction } from 'i18next';

/**
 * Recinto desde el que se mira un muro seleccionado: el de la cara clicada en la vista
 * o, si no se sabe, el primero que lo usa. Un muro compartido pertenece a dos recintos.
 */
export function contextRoomOfWall(level: Level, selection: ViewerSelection): Room | undefined {
  if (selection.kind !== 'wall') return undefined;
  return (
    (selection.face ? roomOnWallFace(level, selection.id, selection.face) : undefined) ??
    roomsOfWall(level, selection.id)[0]
  );
}

/** Nombre automático del muro dentro de un recinto: «Lado 2» o «Lado 2.1». */
export function autoWallName(t: TFunction, level: Level, wallId: string, room?: Room): string {
  const label = room ? wallSideLabel(level, room, wallId) : null;
  if (!label) return t('inspector.wall');
  return label.part
    ? t('inspector.sidePart', { n: label.side, part: label.part })
    : t('inspector.side', { n: label.side });
}

/** Nombre visible: el que le dio el usuario o el automático. */
export function wallDisplayName(t: TFunction, level: Level, wall: Wall, room?: Room): string {
  return wall.name ?? autoWallName(t, level, wall.id, room);
}

/** Selección de un muro mirado desde un recinto (para que las cotas sean las de ese recinto). */
export function wallSelectionFrom(level: Level, room: Room, wallId: string): ViewerSelection {
  const face = wallFaceTowardRoom(level, room, wallId);
  return face ? { kind: 'wall', id: wallId, face } : { kind: 'wall', id: wallId };
}
