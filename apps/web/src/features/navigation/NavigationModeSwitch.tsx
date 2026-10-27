import type { BuiltInNavigationMode } from '@decodeny/viewer';
import { Bird, Footprints, MousePointer2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { useActiveLevel, useUiStore } from '@/state/ui-store';
import { MODE_ORDER } from './mode-order';
import { WalkFromPointButton } from './WalkFromPointButton';

const ICONS: Record<BuiltInNavigationMode, typeof Bird> = {
  edit: MousePointer2,
  person: Footprints,
  ghost: Bird,
};

/** Selector segmentado de modo de vista (Edición · Recorrido · Vuelo libre). */
export function NavigationModeSwitch() {
  const { t } = useTranslation();
  const mode = useUiStore((s) => s.navigationMode);
  const setMode = useUiStore((s) => s.setNavigationMode);
  const hasRooms = useActiveLevel().rooms.length > 0;

  return (
    <div className="flex gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
      <div role="radiogroup" aria-label={t('viewport.modes')} className="flex">
        {MODE_ORDER.map((id, index) => {
          const Icon = ICONS[id];
          const disabled = id === 'person' && !hasRooms;
          const active = mode === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              title={`${t(disabled ? 'navigation.needsRoom' : `navigation.${id}Hint`)} (${t('navigation.shortcut', { key: index + 1 })})`}
              onClick={() => setMode(id)}
              data-testid={`mode-${id}`}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-slate-300',
                active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t(`navigation.${id}`)}</span>
            </button>
          );
        })}
      </div>
      {mode === 'edit' && <WalkFromPointButton />}
    </div>
  );
}
