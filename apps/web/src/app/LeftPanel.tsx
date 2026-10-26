import { LayoutGrid, Sofa } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CatalogPanel } from '@/features/furniture/CatalogPanel';
import { RoomsPanel } from '@/features/rooms/RoomsPanel';
import { cn } from '@/shared/lib/cn';
import { useUiStore } from '@/state/ui-store';

const TABS = [
  { id: 'rooms', icon: LayoutGrid, label: 'leftPanel.rooms' },
  { id: 'catalog', icon: Sofa, label: 'leftPanel.catalog' },
] as const;

/** Panel izquierdo: recintos del proyecto o catálogo de muebles. */
export function LeftPanel() {
  const { t } = useTranslation();
  const tab = useUiStore((s) => s.leftTab);
  const setTab = useUiStore((s) => s.setLeftTab);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label={t('leftPanel.label')}
        className="flex gap-1 border-b border-slate-200 px-3 pt-2"
      >
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            data-testid={`tab-${id}`}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm font-medium transition-colors',
              tab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(label)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === 'rooms' ? <RoomsPanel /> : <CatalogPanel />}
      </div>
    </div>
  );
}
