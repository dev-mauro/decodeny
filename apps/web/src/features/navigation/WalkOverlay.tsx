import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useCoarsePointer } from '@/shared/lib/use-media-query';
import { Button } from '@/shared/ui/Button';
import { useUiStore } from '@/state/ui-store';

/**
 * Capa sobre la vista en los modos de recorrido: invita a capturar el mouse, muestra los
 * controles y una mira central. No intercepta clics: el clic llega al canvas, que captura
 * el puntero.
 */
export function WalkOverlay() {
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
    [t('navigation.keysPause'), t('navigation.controlsPause')],
  ];

  if (locked) {
    return (
      <div className="pointer-events-none absolute inset-0" data-testid="walk-hud">
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1.5px_rgba(15,23,42,0.6)]"
        />
        <p className="absolute bottom-3 left-3 rounded-lg bg-slate-900/60 px-3 py-1.5 text-xs text-white">
          {t(`navigation.${mode}`)} ·{' '}
          {controls.map(([k, a]) => `${k} ${a.toLowerCase()}`).join(' · ')}
        </p>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/25 p-4"
      data-testid="walk-overlay"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl bg-white/95 p-6 text-center shadow-xl">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t(`navigation.${mode}`)}</h2>
          <p className="text-sm text-slate-500">{t(`navigation.${mode}Hint`)}</p>
        </div>
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
          {t('navigation.clickToStart')}
        </p>
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
          <label className="pointer-events-auto flex items-center gap-2 text-sm text-slate-600">
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
          className="pointer-events-auto"
          onClick={() => setMode('edit')}
          data-testid="exit-walk"
        >
          {t('navigation.exit')}
        </Button>
      </div>
    </div>
  );
}
