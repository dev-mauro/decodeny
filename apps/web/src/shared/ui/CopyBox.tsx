import { Check, Copy } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Button } from './Button';

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

/** Etiqueta sobre un control (que recibe el id para asociarla). */
export function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-slate-500">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/** Texto largo (enlace o código) para copiar: seleccionable y con botón de copiar. */
export function CopyBox({
  label,
  value,
  testId,
  copyLabel,
  copiedLabel,
  rows = 3,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
  readonly copyLabel: string;
  readonly copiedLabel: string;
  readonly rows?: number;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    // Sin portapapeles (contexto no seguro) queda el texto seleccionable.
    if (!window.isSecureContext) return;
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };
  return (
    <Field label={label}>
      {(id) => (
        <div className="flex gap-2">
          <textarea
            id={id}
            readOnly
            value={value}
            rows={rows}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(inputClass, 'resize-none py-1.5 font-mono text-xs break-all')}
            data-testid={testId}
          />
          <Button
            size="sm"
            icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            onClick={copy}
            data-testid={`${testId}-copy`}
          >
            {copied ? copiedLabel : copyLabel}
          </Button>
        </div>
      )}
    </Field>
  );
}
