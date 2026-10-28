import type { ViewerApi } from '@decodeny/viewer';
import { ArrowDownUp, PanelRight } from 'lucide-react';
import { useEffect, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { useCoarsePointer } from '@/shared/lib/use-media-query';
import { useUiStore } from '@/state/ui-store';

/**
 * Recorrido, ascensor al alcance: afuera, cómo llamarlo; adentro, cómo usar la botonera (E, un
 * clic con el puntero capturado o, en pantallas táctiles, este botón).
 */
export function ElevatorHint({ viewerRef }: { readonly viewerRef: RefObject<ViewerApi | null> }) {
  const { t } = useTranslation();
  const elevator = useUiStore((s) => s.nearbyElevator);
  const menu = useUiStore((s) => s.elevatorMenu);
  const mode = useUiStore((s) => s.navigationMode);
  const touch = useCoarsePointer();
  if (!elevator || menu || mode !== 'person') return null;
  const label = t(
    elevator.action === 'call' ? 'navigation.elevatorCall' : 'navigation.elevatorPanel',
  );
  const Icon = elevator.action === 'call' ? ArrowDownUp : PanelRight;
  if (touch) {
    return (
      <button
        type="button"
        className="absolute bottom-40 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/75 px-4 py-2.5 text-sm font-medium text-white shadow-lg active:bg-slate-900"
        onClick={() => viewerRef.current?.interactElevator?.()}
        data-testid="elevator-use"
      >
        <Icon className="size-4" aria-hidden />
        {label}
      </button>
    );
  }
  return (
    <p
      className="pointer-events-none absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/70 px-3 py-1.5 text-xs text-white shadow"
      data-testid="elevator-hint"
      data-elevator-action={elevator.action}
      data-elevator-stop={elevator.stops.find((stop) => stop.levelId === elevator.current)?.name}
    >
      <kbd className="rounded bg-white/20 px-1.5 font-mono">E</kbd>
      {label}
    </p>
  );
}

/**
 * Botonera del ascensor (al usarla desde adentro): los pisos, el de arriba primero. Elegir uno
 * la cierra y el ascensor parte; también con las teclas 1–9 (1 es la parada de más abajo) y se
 * cierra con Esc.
 */
export function ElevatorPanel({ viewerRef }: { readonly viewerRef: RefObject<ViewerApi | null> }) {
  const { t } = useTranslation();
  const elevator = useUiStore((s) => s.nearbyElevator);
  const open = useUiStore((s) => s.elevatorMenu);
  const setOpen = useUiStore((s) => s.setElevatorMenu);
  const mode = useUiStore((s) => s.navigationMode);
  const active = open && elevator?.action === 'panel' && mode === 'person';

  const go = (levelId: string) => {
    setOpen(false);
    viewerRef.current?.travel?.(levelId);
  };

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        return;
      }
      const stop = elevator.stops[Number(e.key) - 1];
      if (!stop || e.repeat || stop.levelId === elevator.current) return;
      setOpen(false);
      viewerRef.current?.travel?.(stop.levelId);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, elevator, setOpen, viewerRef]);

  if (!active) return null;
  return (
    <div
      className="absolute bottom-14 left-1/2 flex -translate-x-1/2 flex-col items-stretch gap-1 rounded-2xl bg-slate-900/80 p-2 text-white shadow-lg"
      data-testid="elevator-panel"
    >
      <p className="flex items-center justify-center gap-1.5 px-2 text-xs text-white/80">
        <ArrowDownUp className="size-3.5" aria-hidden />
        {t('navigation.elevatorChoose')}
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
            onClick={() => go(stop.levelId)}
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
