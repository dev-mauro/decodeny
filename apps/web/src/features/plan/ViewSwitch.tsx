import { Box, Map as MapIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { useUiStore } from '@/state/ui-store';

const VIEWS = [
  { id: '3d', icon: Box, label: 'viewport.view3d', hint: 'viewport.view3dHint' },
  { id: 'plan', icon: MapIcon, label: 'viewport.viewPlan', hint: 'viewport.viewPlanHint' },
] as const;

/** Selector de vista principal: 3D o planta 2D. */
export function ViewSwitch() {
  const { t } = useTranslation();
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  return (
    <div
      role="radiogroup"
      aria-label={t('viewport.views')}
      className="flex rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur"
    >
      {VIEWS.map(({ id, icon: Icon, label, hint }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={view === id}
          title={t(hint)}
          onClick={() => setView(id)}
          data-testid={`view-${id}`}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
            view === id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="hidden sm:inline">{t(label)}</span>
        </button>
      ))}
    </div>
  );
}
