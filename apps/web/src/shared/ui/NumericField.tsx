import { useId, useState, type KeyboardEvent } from 'react';
import { cn } from '@/shared/lib/cn';

export interface NumericFieldProps {
  readonly label: string;
  /** Oculta visualmente la etiqueta (sigue disponible para lectores de pantalla). */
  readonly hideLabel?: boolean;
  readonly value: number;
  readonly onCommit: (value: number) => void;
  readonly parse: (text: string) => number | null;
  readonly format: (value: number) => string;
  /** Mensaje cuando el texto no se puede interpretar. */
  readonly invalidMessage: string;
  /** Devuelve un mensaje si el valor está fuera de rango. */
  readonly validate?: (value: number) => string | null;
  readonly suffix?: string;
  /** Incremento con flechas (y ×10 con Shift), en unidades del valor. */
  readonly step?: number;
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Campo numérico de edición "por confirmación": el valor se aplica al presionar Enter,
 * al salir del campo o con las flechas. Escape revierte. Pensado para ingresar medidas
 * rápidamente con el teclado.
 */
export function NumericField({
  label,
  hideLabel,
  value,
  onCommit,
  parse,
  format,
  invalidMessage,
  validate,
  suffix,
  step,
  hint,
  disabled,
  className,
  testId,
}: NumericFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Si el valor cambia desde afuera (deshacer, otro panel) se descarta el borrador.
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    setDraft(null);
    setError(null);
  }

  const tryCommit = (text: string): boolean => {
    const parsed = parse(text);
    if (parsed === null) {
      setError(invalidMessage);
      return false;
    }
    const rangeError = validate?.(parsed) ?? null;
    if (rangeError) {
      setError(rangeError);
      return false;
    }
    setError(null);
    setDraft(null);
    if (parsed !== value) onCommit(parsed);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (tryCommit(e.currentTarget.value)) e.currentTarget.select();
    } else if (e.key === 'Escape') {
      if (draft !== null || error) e.stopPropagation();
      setDraft(null);
      setError(null);
    } else if (step && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const base = parse(e.currentTarget.value) ?? value;
      const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
      const next = Math.round((base + delta) / step) * step;
      if (!validate?.(next)) {
        setDraft(null);
        setError(null);
        onCommit(next);
      }
    }
  };

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className={cn('text-xs font-medium text-slate-500', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <div
        className={cn(
          'flex h-9 items-center rounded-lg border bg-white pr-2.5 transition-colors focus-within:ring-2',
          error
            ? 'border-red-400 focus-within:ring-red-200'
            : 'border-slate-300 focus-within:border-brand-500 focus-within:ring-brand-100',
          disabled && 'bg-slate-50 text-slate-400',
        )}
      >
        <input
          id={id}
          data-testid={testId}
          className="h-full w-full min-w-0 rounded-lg bg-transparent px-2.5 text-sm tabular-nums outline-none"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={draft ?? format(value)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            if (draft !== null) tryCommit(e.currentTarget.value);
          }}
          onKeyDown={onKeyDown}
        />
        {suffix && <span className="text-sm text-slate-400 select-none">{suffix}</span>}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-slate-400">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
