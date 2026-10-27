import { resolveItemDefinition, resolveOpeningDefinition } from '@decodeny/catalog';
import { localize } from '@decodeny/domain';
import { useTranslation } from 'react-i18next';
import { ItemInspector } from '@/features/furniture/ItemInspector';
import { MultiItemInspector } from '@/features/furniture/MultiItemInspector';
import { selectedTargets } from '@/state/selection-model';
import { OpeningInspector } from '@/features/openings/OpeningInspector';
import { RoomInspector } from '@/features/rooms/RoomInspector';
import { contextRoomOfWall, wallDisplayName } from '@/features/walls/wall-context';
import { WallInspector } from '@/features/walls/WallInspector';
import { useActiveLevel, useUiStore } from '@/state/ui-store';

/** Panel de propiedades de la selección actual. */
export function InspectorPanel() {
  const { t, i18n } = useTranslation();
  const level = useActiveLevel();
  const selection = useUiStore((s) => s.selection);
  const selectionGroup = useUiStore((s) => s.selectionGroup);
  // Varios muebles seleccionados: inspector del grupo.
  const groupItems =
    selectionGroup.length > 0
      ? selectedTargets({ selection, selectionGroup }).flatMap((target) => {
          const found = level.items.find((i) => i.id === target.id);
          return target.kind === 'item' && found ? [found] : [];
        })
      : [];
  const multi = groupItems.length > 1;

  const room =
    selection?.kind === 'room' ? level.rooms.find((r) => r.id === selection.id) : undefined;
  const wall =
    selection?.kind === 'wall' ? level.walls.find((w) => w.id === selection.id) : undefined;
  const opening =
    selection?.kind === 'opening' ? level.openings.find((o) => o.id === selection.id) : undefined;
  const item =
    selection?.kind === 'item' ? level.items.find((i) => i.id === selection.id) : undefined;
  const contextRoom = wall && selection ? contextRoomOfWall(level, selection) : undefined;
  const title = multi
    ? t('furniture.selectedMany', { count: groupItems.length })
    : room
      ? t('inspector.room')
      : wall
        ? wallDisplayName(t, level, wall, contextRoom)
        : opening
          ? localize(resolveOpeningDefinition(opening.def).name, i18n.language)
          : item
            ? localize(resolveItemDefinition(item.def).name, i18n.language)
            : null;

  return (
    <section aria-labelledby="inspector-title" className="flex min-h-0 flex-1 flex-col">
      <h2
        id="inspector-title"
        className="truncate px-4 pt-4 pb-3 text-sm font-semibold text-slate-900"
        data-testid="inspector-title"
      >
        {title ?? t('inspector.title')}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {room && <RoomInspector key={room.id} level={level} room={room} />}
        {wall && (
          <WallInspector key={wall.id} level={level} wall={wall} contextRoom={contextRoom} />
        )}
        {opening && <OpeningInspector key={opening.id} level={level} opening={opening} />}
        {multi && <MultiItemInspector items={groupItems} />}
        {item && !multi && <ItemInspector key={item.id} level={level} item={item} />}
        {!room && !wall && !opening && !item && (
          <p className="text-sm text-slate-500">{t('inspector.empty')}</p>
        )}
      </div>
    </section>
  );
}
