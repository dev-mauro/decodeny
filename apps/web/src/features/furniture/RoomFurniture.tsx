import { resolveItemDefinition } from '@decodeny/catalog';
import { itemsInRoom, localize, type Level, type Room } from '@decodeny/domain';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { useUiStore } from '@/state/ui-store';
import { itemIcon } from './item-icons';

/** Muebles de un recinto, con acceso rápido al catálogo para agregar más. */
export function RoomFurniture({ level, room }: { readonly level: Level; readonly room: Room }) {
  const { t, i18n } = useTranslation();
  const select = useUiStore((s) => s.select);
  const setHighlighted = useUiStore((s) => s.setHighlighted);
  const setLeftTab = useUiStore((s) => s.setLeftTab);
  const items = itemsInRoom(level, room);

  return (
    <section className="flex flex-col gap-2" aria-labelledby="room-furniture-title">
      <div className="flex items-center justify-between">
        <h3
          id="room-furniture-title"
          className="text-xs font-semibold tracking-wide text-slate-400 uppercase"
        >
          {t('furniture.title')} ({items.length})
        </h3>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus className="size-4" />}
          onClick={() => setLeftTab('catalog')}
          data-testid="room-add-furniture"
        >
          {t('furniture.addFromCatalog')}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{t('furniture.none')}</p>
      ) : (
        <ul className="flex flex-col" data-testid="room-furniture">
          {items.map((item) => {
            const def = resolveItemDefinition(item.def);
            const Icon = itemIcon(def);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                  onClick={() => select({ kind: 'item', id: item.id })}
                  onMouseEnter={() => setHighlighted([{ kind: 'item', id: item.id }])}
                  onMouseLeave={() => setHighlighted([])}
                >
                  <Icon className="size-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {localize(def.name, i18n.language)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
