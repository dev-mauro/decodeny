/** Indicación flotante de la herramienta activa de la vista (arriba a la izquierda). */
export function ToolHint({ text, testId }: { readonly text: string; readonly testId: string }) {
  return (
    <p
      className="pointer-events-none absolute top-16 left-3 max-w-[calc(100%-1.5rem)] rounded-xl bg-slate-900/85 px-3 py-2 text-xs text-white shadow-lg"
      data-testid={testId}
      role="status"
    >
      {text}
    </p>
  );
}
