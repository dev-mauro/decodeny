import { useTranslation } from 'react-i18next';
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
  if (mode === 'edit') return null;

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
