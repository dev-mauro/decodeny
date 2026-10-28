import { DEFAULT_KEYMAP, type ViewerApi } from '@decodeny/viewer';
import { useEffect, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useCoarsePointer } from '@/shared/lib/use-media-query';
import { Button } from '@/shared/ui/Button';
import { useUiStore } from '@/state/ui-store';

/**
 * Capa sobre la vista en los modos de recorrido: una presentación con los controles al entrar
 * (ver `WalkIntro`), luego la línea de controles y, con el mouse capturado, una mira central.
 */
export function WalkOverlay({ viewerRef }: { readonly viewerRef: RefObject<ViewerApi | null> }) {
  const { t } = useTranslation();
  const mode = useUiStore((s) => s.navigationMode);
  const locked = useUiStore((s) => s.pointerLocked);
  const setMode = useUiStore((s) => s.setNavigationMode);
  const headBob = useUiStore((s) => s.headBob);
  const setHeadBob = useUiStore((s) => s.setHeadBob);
  const touch = useCoarsePointer();
  // El aviso táctil se puede cerrar; vuelve a aparecer al entrar de nuevo a un modo.
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (mode === 'edit') return null;

  // En pantallas táctiles no hay mouse que capturar: los controles están en la vista (joystick y
  // deslizar para mirar). Se muestra un aviso con la ayuda; su X solo lo cierra (para salir del
  // recorrido está «Edición» en la barra de modos).
  if (touch) {
    if (dismissed === mode) return null;
    return (
      <div
        className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-3"
        data-testid="walk-touch-hud"
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-slate-900/70 py-1 pr-1 pl-3 text-xs text-white shadow-lg">
          <span>
            {t(`navigation.${mode}`)} · {t('navigation.touchHint')}
          </span>
          <button
            type="button"
            onClick={() => setDismissed(mode)}
            aria-label={t('toolHint.hide')}
            data-testid="walk-hint-dismiss"
            className="flex size-8 items-center justify-center rounded-lg hover:bg-white/15"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  const controls: [string, string][] = [
    [t('navigation.keysMove'), t('navigation.controlsMove')],
    [t('navigation.keysLook'), t('navigation.controlsLook')],
    [t('navigation.keysRun'), t('navigation.controlsRun')],
    ...(mode === 'ghost'
      ? ([
          [t('navigation.keysFly'), t('navigation.controlsFly')],
          [t('navigation.keysSpeed'), t('navigation.controlsSpeed')],
        ] as [string, string][])
      : []),
    [
      t(mode === 'ghost' ? 'navigation.keysDoorFly' : 'navigation.keysDoorWalk'),
      t('navigation.controlsDoor'),
    ],
    [t('navigation.keysPause'), t('navigation.controlsPause')],
  ];

  return (
    <WalkIntro
      key={mode}
      mode={mode}
      locked={locked}
      viewerRef={viewerRef}
      controls={controls}
      headBob={headBob}
      setHeadBob={setHeadBob}
      onExit={() => setMode('edit')}
    />
  );
}

/** Teclas que mueven: empezar a moverse cierra la presentación. */
const MOVE_KEYS = new Set(
  Object.entries(DEFAULT_KEYMAP).flatMap(([action, codes]) => (action === 'run' ? [] : codes)),
);

/**
 * Al entrar a un modo, una presentación con los controles. Se cierra con «Comenzar» (que además
 * captura el mouse), con un clic fuera de ella, al empezar a moverse o al capturar el mouse; luego
 * solo queda la línea de controles (y la mira con el mouse capturado). Vuelve al entrar de nuevo.
 */
function WalkIntro({
  mode,
  locked,
  viewerRef,
  controls,
  headBob,
  setHeadBob,
  onExit,
}: {
  readonly mode: 'person' | 'ghost';
  readonly locked: boolean;
  readonly viewerRef: RefObject<ViewerApi | null>;
  readonly controls: readonly [string, string][];
  readonly headBob: boolean;
  readonly setHeadBob: (headBob: boolean) => void;
  readonly onExit: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const visible = open && !locked;

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  const begin = () => {
    setOpen(false);
    viewerRef.current?.lockPointer?.();
  };

  if (!visible) {
    return (
      <div className="pointer-events-none absolute inset-0" data-testid="walk-hud">
        {locked && (
          <div
            aria-hidden
            className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1.5px_rgba(15,23,42,0.6)]"
          />
        )}
        <p className="absolute bottom-3 left-3 rounded-lg bg-slate-900/60 px-3 py-1.5 text-xs text-white">
          {t(`navigation.${mode}`)} ·{' '}
          {controls.map(([k, a]) => `${k} ${a.toLowerCase()}`).join(' · ')}
        </p>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-slate-900/25 p-4"
      onPointerDown={(e) => {
        // Un clic fuera de la presentación la cierra (y, como antes, captura el mouse).
        if (e.target === e.currentTarget) begin();
      }}
      data-testid="walk-overlay"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl bg-white/95 p-6 text-center shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{t(`navigation.${mode}Intro`)}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left text-sm">
          {controls.map(([keys, action]) => (
            <div key={action} className="contents">
              <dt>
                <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-slate-600">{action}</dd>
            </div>
          ))}
        </dl>
        {mode === 'person' && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={headBob}
              onChange={(e) => setHeadBob(e.target.checked)}
              data-testid="head-bob"
            />
            {t('navigation.headBob')}
          </label>
        )}
        <Button
          variant="primary"
          className="h-12 w-full text-base"
          onClick={begin}
          data-testid="walk-begin"
        >
          {t('navigation.begin')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onExit} data-testid="exit-walk">
          {t('navigation.exit')}
        </Button>
      </div>
    </div>
  );
}
