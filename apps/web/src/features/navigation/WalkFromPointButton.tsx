import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { useActiveLevel, useUiStore } from '@/state/ui-store';

/** Elegir con un clic en el piso (3D o planta) dónde empieza el recorrido. */
export function WalkFromPointButton() {
  const { t } = useTranslation();
  const picking = useUiStore((s) => s.pickingWalkStart);
  const setPicking = useUiStore((s) => s.setPickingWalkStart);
  const hasRooms = useActiveLevel().rooms.length > 0;
  return (
    <button
      type="button"
      aria-pressed={picking}
      disabled={!hasRooms}
      title={t(hasRooms ? 'navigation.pickStart' : 'navigation.needsRoom')}
      aria-label={t('navigation.pickStart')}
      onClick={() => setPicking(!picking)}
      data-testid="walk-from-point"
      className={cn(
        'flex size-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:text-slate-300',
        picking ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
      )}
    >
      <MapPin className="size-4" aria-hidden />
    </button>
  );
}
