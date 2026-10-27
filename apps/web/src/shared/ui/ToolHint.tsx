export interface ToolHintAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
}

/**
 * Indicación flotante de la herramienta activa de la vista (arriba a la izquierda). Las
 * acciones son los equivalentes táctiles de los atajos (Enter, R, Esc…).
 */
export function ToolHint({
  text,
  testId,
  actions = [],
}: {
  readonly text: string;
  readonly testId: string;
  readonly actions?: readonly ToolHintAction[];
}) {
  return (
    <div
      className="pointer-events-none absolute top-16 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-xl bg-slate-900/85 px-3 py-2 text-xs text-white shadow-lg"
      data-testid={testId}
      role="status"
    >
      <span>{text}</span>
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
