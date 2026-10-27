import { parseLength } from '@decodeny/domain';
import type { ViewerApi } from '@decodeny/viewer';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoarsePointer } from '@/shared/lib/use-media-query';
import { ToolHint } from '@/shared/ui/ToolHint';
import { notify } from '@/state/notifications-store';
import { useUiStore } from '@/state/ui-store';

/** Direcciones de los botones (en planta, y hacia el norte = arriba en pantalla). */
const DIRECTIONS = [
  { id: 'right', icon: ArrowRight, dir: { x: 1, y: 0 }, label: 'viewport.wallRight' },
  { id: 'up', icon: ArrowUp, dir: { x: 0, y: 1 }, label: 'viewport.wallUp' },
  { id: 'left', icon: ArrowLeft, dir: { x: -1, y: 0 }, label: 'viewport.wallLeft' },
  { id: 'down', icon: ArrowDown, dir: { x: 0, y: -1 }, label: 'viewport.wallDown' },
] as const;

/**
 * Indicaciones al dibujar muros, con lo que hace falta sin teclado: escribir un largo y elegir
 * la dirección agrega un tramo exacto desde el último punto; «Terminar» sale de la herramienta.
 */
export function WallDrawHint({
  viewerRef,
  chainActive,
}: {
  readonly viewerRef: RefObject<ViewerApi | null>;
  /** Hay un punto de partida puesto (se puede agregar un tramo). */
  readonly chainActive: boolean;
}) {
  const { t } = useTranslation();
  const touch = useCoarsePointer();
  const active = useUiStore(
    (s) => s.view === 'plan' && s.planTool === 'wall' && s.placement === null,
  );
  const [length, setLength] = useState('');
  if (!active) return null;

  const add = (dir: { x: number; y: number }) => {
    const parsed = parseLength(length);
    if (!parsed.ok) {
      notify('error', t('field.invalidLength'));
      return;
    }
    if (viewerRef.current?.drawSegment?.(dir, parsed.value)) setLength('');
  };

  return (
    <ToolHint
      text={t(touch ? 'viewport.wallHintTouch' : 'viewport.wallHint')}
      testId="wall-draw-hint"
      actions={[
        {
          label: t('viewport.wallDone'),
          onClick: () => useUiStore.getState().setPlanTool('select'),
          testId: 'wall-draw-done',
        },
      ]}
    >
      <span className="pointer-events-auto flex basis-full items-center gap-1">
        <label className="flex items-center gap-1">
          <span className="sr-only">{t('viewport.wallLength')}</span>
          <input
            inputMode="decimal"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder={t('viewport.wallLength')}
            disabled={!chainActive}
            className="h-7 w-20 rounded-md border-0 bg-white/15 px-2 text-white placeholder:text-white/60 disabled:opacity-40"
            data-testid="wall-length"
          />
        </label>
        {DIRECTIONS.map(({ id, icon: Icon, dir, label }) => (
          <button
            key={id}
            type="button"
            disabled={!chainActive || length.trim() === ''}
            onClick={() => add(dir)}
            aria-label={t(label)}
            data-testid={`wall-dir-${id}`}
            className="flex size-7 items-center justify-center rounded-md bg-white/15 hover:bg-white/25 disabled:opacity-40"
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        ))}
        {!chainActive && <span className="text-white/70">{t('viewport.wallLengthHint')}</span>}
      </span>
    </ToolHint>
  );
}
