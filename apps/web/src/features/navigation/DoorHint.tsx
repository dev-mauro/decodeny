import type { ViewerApi } from '@decodeny/viewer';
import { DoorClosed, DoorOpen } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoarsePointer } from '@/shared/lib/use-media-query';
import { useUiStore } from '@/state/ui-store';

/**
 * Recorrido y vuelo: con una puerta al alcance, indica cómo abrirla o cerrarla. En pantallas
 * táctiles es un botón (no hay teclas ni clic con el puntero capturado).
 */
export function DoorHint({ viewerRef }: { readonly viewerRef: RefObject<ViewerApi | null> }) {
  const { t } = useTranslation();
  const door = useUiStore((s) => s.nearbyDoor);
  const mode = useUiStore((s) => s.navigationMode);
  const touch = useCoarsePointer();
  if (!door || mode === 'edit') return null;
  const label = t(door.open ? 'navigation.doorClose' : 'navigation.doorOpen');
  const Icon = door.open ? DoorClosed : DoorOpen;
  if (touch) {
    return (
      <button
        type="button"
        className="absolute bottom-40 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/75 px-4 py-2.5 text-sm font-medium text-white shadow-lg active:bg-slate-900"
        onClick={() => viewerRef.current?.toggleDoor?.()}
        data-testid="door-toggle"
      >
        <Icon className="size-4" aria-hidden />
        {label}
      </button>
    );
  }
  return (
    <p
      className="pointer-events-none absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/70 px-3 py-1.5 text-xs text-white shadow"
      data-testid="door-hint"
      data-door-open={door.open}
    >
      <kbd className="rounded bg-white/20 px-1.5 font-mono">{mode === 'ghost' ? 'F' : 'E'}</kbd>
      {label}
    </p>
  );
}
