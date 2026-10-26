import { ITEM_CATEGORIES, itemCatalog } from '@decodeny/catalog';
import { localize } from '@decodeny/domain';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveLevel, useUiStore } from '@/state/ui-store';
import { targetRoom } from './item-actions';
import { startPlacement } from './placement';
import { itemIcon } from './item-icons';

/** Minúsculas y sin acentos, para buscar "cama", "comoda" o "clóset" indistintamente. */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Catálogo de muebles: búsqueda y categorías; un clic agrega el mueble al recinto activo. */
export function CatalogPanel() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const level = useActiveLevel();
  const selection = useUiStore((s) => s.selection);
  const room = targetRoom(level, selection) ?? level.rooms[0];

  const groups = useMemo(() => {
    const q = fold(query.trim());
    const matches = itemCatalog.list().filter((def) => {
      if (!q) return true;
      const haystack = [
        localize(def.name, i18n.language),
        t(`catalog.categories.${def.category}`),
        ...(def.keywords ?? []),
      ];
      return haystack.some((h) => fold(h).includes(q));
    });
    return ITEM_CATEGORIES.map((category) => ({
      category,
      items: matches.filter((d) => d.category === category),
    })).filter((g) => g.items.length > 0);
  }, [i18n.language, query, t]);

  return (
    <section aria-labelledby="catalog-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-2 px-4 pt-4 pb-2">
        <h2 id="catalog-title" className="text-sm font-semibold text-slate-900">
          {t('catalog.title')}
        </h2>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
          <span className="sr-only">{t('catalog.search')}</span>
          <input
            type="search"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder={t('catalog.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="catalog-search"
          />
        </label>
        <p className="text-xs text-slate-500" data-testid="catalog-target">
          {room ? t('catalog.addsTo', { room: room.name }) : t('catalog.noRoom')}
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" data-testid="catalog-list">
        {groups.length === 0 && (
          <p className="px-2 py-2 text-sm text-slate-500">{t('catalog.noResults')}</p>
        )}
        {groups.map(({ category, items }) => (
          <div key={category} className="mb-3">
            <h3 className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              {t(`catalog.categories.${category}`)}
            </h3>
            <ul className="flex flex-col">
              {items.map((def) => {
                const Icon = itemIcon(def);
                const name = localize(def.name, i18n.language);
                return (
                  <li key={def.id}>
                    <button
                      type="button"
                      onClick={() => startPlacement(def)}
                      aria-label={t('catalog.add', { name })}
                      data-testid={`catalog-${def.id}`}
                      className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
                    >
                      <Icon
                        className="size-4 shrink-0 text-slate-400 group-hover:text-brand-500"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <Plus
                        className="size-3.5 shrink-0 text-slate-300 group-hover:text-brand-500"
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
