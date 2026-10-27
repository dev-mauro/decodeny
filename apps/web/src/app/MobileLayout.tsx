import type { ViewerCameraApi } from '@decodeny/viewer';
import { LayoutGrid, SlidersHorizontal, Sofa, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogPanel } from '@/features/furniture/CatalogPanel';
import { RoomsPanel } from '@/features/rooms/RoomsPanel';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { useUiStore, type MobilePanel } from '@/state/ui-store';
import { InspectorPanel } from './InspectorPanel';
import { Viewport } from './Viewport';

const TABS = [
  { id: 'rooms', icon: LayoutGrid, label: 'leftPanel.rooms' },
  { id: 'catalog', icon: Sofa, label: 'leftPanel.catalog' },
  { id: 'inspector', icon: SlidersHorizontal, label: 'inspector.title' },
] as const;

/** Hoja inferior sobre la vista: el panel elegido, con su propio scroll. */
function Sheet({
  title,
  onClose,
  side,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  /** Horizontal: panel a la derecha, a toda la altura (abajo no hay lugar). */
  readonly side: boolean;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={title}
      data-testid="mobile-sheet"
      className={cn(
        'absolute z-30 flex flex-col bg-white',
        side
          ? 'inset-y-0 right-0 w-[min(360px,55%)] border-l border-slate-200 pt-2 shadow-[-8px_0_24px_rgba(15,23,42,0.12)]'
          : 'inset-x-0 bottom-0 max-h-[62%] rounded-t-2xl border-t border-slate-200 shadow-[0_-8px_24px_rgba(15,23,42,0.12)]',
      )}
    >
      {!side && (
        <div className="flex items-center justify-between px-2 pt-1">
          <span aria-hidden className="mx-auto mt-1 h-1 w-10 rounded-full bg-slate-300" />
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('mobile.close')}
        data-testid="mobile-sheet-close"
        className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
      >
        <X className="size-4" aria-hidden />
      </button>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </section>
  );
}

/**
 * Layout de pantallas angostas (teléfono, tablet vertical): la vista ocupa la pantalla y una
 * barra inferior abre recintos, catálogo o propiedades como hoja sobre la vista. Las
 * herramientas que requieren tocar la vista (ubicar un mueble, dibujar, medir) cierran la hoja.
 */
export function MobileLayout({
  cameraRef,
}: {
  readonly cameraRef: RefObject<ViewerCameraApi | null>;
}) {
  const { t } = useTranslation();
  const panel = useUiStore((s) => s.mobilePanel);
  // Teléfono en horizontal (poca altura): riel a la izquierda y paneles a la derecha.
  const landscape = useMediaQuery('(orientation: landscape) and (max-height: 600px)');
  const setPanel = useUiStore((s) => s.setMobilePanel);
  const selection = useUiStore((s) => s.selection);

  // Elegir un recinto en la lista muestra sus propiedades.
  const previous = useRef(selection);
  useEffect(() => {
    if (selection && selection !== previous.current && panel === 'rooms') setPanel('inspector');
    previous.current = selection;
  }, [panel, selection, setPanel]);

  const content: Record<NonNullable<MobilePanel>, ReactNode> = {
    rooms: <RoomsPanel />,
    catalog: <CatalogPanel />,
    inspector: <InspectorPanel />,
  };

  return (
    <div className={cn('flex min-h-0 flex-1', landscape ? 'flex-row-reverse' : 'flex-col')}>
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <Viewport cameraRef={cameraRef} />
        {panel && (
          <Sheet
            title={t(TABS.find((tab) => tab.id === panel)!.label)}
            side={landscape}
            onClose={() => setPanel(null)}
          >
            {content[panel]}
          </Sheet>
        )}
      </div>
      <nav
        aria-label={t('mobile.panels')}
        className={cn(
          'flex shrink-0 bg-white',
          landscape
            ? 'w-16 flex-col border-r border-slate-200 pl-[env(safe-area-inset-left)]'
            : 'border-t border-slate-200 pb-[env(safe-area-inset-bottom)]',
        )}
      >
        {TABS.map(({ id, icon: Icon, label }) => {
          const active = panel === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setPanel(active ? null : id)}
              data-testid={`mobile-tab-${id}`}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                landscape ? 'min-h-14 text-[10px]' : 'h-14',
                active ? 'text-brand-700' : 'text-slate-500',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t(label)}
              {id === 'inspector' && selection && !active && (
                <span
                  aria-hidden
                  className="absolute top-2 right-[calc(50%-18px)] size-2 rounded-full bg-brand-600"
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
