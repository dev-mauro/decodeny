import type { ViewerApi } from '@decodeny/viewer';
import { ArrowDownUp } from 'lucide-react';
import { useEffect, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { useUiStore } from '@/state/ui-store';

/**
 * Recorrido: dentro de un ascensor detenido, botones con sus pisos (el de arriba primero, como
 * en una botonera). También con las teclas 1–9 (1 es la parada de más abajo).
 */
export function ElevatorPanel({ viewerRef }: { readonly viewerRef: RefObject<ViewerApi | null> }) {
  const { t } = useTranslation();
  const elevator = useUiStore((s) => s.nearbyElevator);
  const mode = useUiStore((s) => s.navigationMode);
  const active = elevator !== null && mode === 'person';

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const stop = elevator.stops[Number(e.key) - 1];
      if (!stop || e.repeat || stop.levelId === elevator.current) return;
      viewerRef.current?.travel?.(stop.levelId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, elevator, viewerRef]);

  if (!active) return null;
  return (
    <div
      className="absolute bottom-14 left-1/2 flex -translate-x-1/2 flex-col items-stretch gap-1 rounded-2xl bg-slate-900/75 p-2 text-white shadow-lg"
      data-testid="elevator-panel"
    >
      <p className="flex items-center justify-center gap-1.5 px-2 text-xs text-white/80">
        <ArrowDownUp className="size-3.5" aria-hidden />
        {t('navigation.elevator')}
      </p>
      {[...elevator.stops].reverse().map((stop) => {
        const index = elevator.stops.indexOf(stop) + 1;
        const here = stop.levelId === elevator.current;
        return (
          <button
            key={stop.levelId}
            type="button"
            disabled={here}
            aria-label={t('navigation.elevatorGo', { name: stop.name })}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm',
              here ? 'bg-white/25 font-medium' : 'hover:bg-white/15 active:bg-white/25',
            )}
            onClick={() => viewerRef.current?.travel?.(stop.levelId)}
            data-testid={`elevator-stop-${index}`}
          >
            <kbd className="rounded bg-white/20 px-1.5 font-mono text-xs">{index}</kbd>
            {stop.name}
          </button>
        );
      })}
    </div>
  );
}
