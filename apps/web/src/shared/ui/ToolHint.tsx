import { Info, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface ToolHintAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
}

/**
 * Indicación flotante de la herramienta activa de la vista (arriba a la izquierda). Las
 * acciones son los equivalentes táctiles de los atajos (Enter, R, Esc…). La X oculta solo el
 * texto: la herramienta sigue activa y sus acciones a mano.
 */
export function ToolHint({
  text,
  testId,
  actions = [],
  children,
}: {
  readonly text: string;
  readonly testId: string;
  readonly actions?: readonly ToolHintAction[];
  /** Controles propios de la herramienta (p. ej. escribir un largo). */
  readonly children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);
  return (
    <div
      className="pointer-events-none absolute top-16 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-xl bg-slate-900/85 px-3 py-2 text-xs text-white shadow-lg"
      data-testid={testId}
      role="status"
    >
      {hidden ? (
        <button
          type="button"
          onClick={() => setHidden(false)}
          aria-label={t('toolHint.show')}
          className="pointer-events-auto -ml-1 flex size-6 items-center justify-center rounded-md hover:bg-white/15"
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      ) : (
        <>
          <span className="min-w-0">{text}</span>
          <button
            type="button"
            onClick={() => setHidden(true)}
            aria-label={t('toolHint.hide')}
            data-testid={`${testId}-hide`}
            className="pointer-events-auto flex size-6 items-center justify-center rounded-md hover:bg-white/15"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </>
      )}
      {children}
      {actions.map((action) => (
        <button
          key={action.testId}
          type="button"
          onClick={action.onClick}
          data-testid={action.testId}
          className="pointer-events-auto rounded-lg bg-white/15 px-2.5 py-1 font-medium hover:bg-white/25"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
