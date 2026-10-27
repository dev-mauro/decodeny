import { useId, useState } from 'react';
import { cn } from '@/shared/lib/cn';

export interface TextFieldProps {
  readonly label: string;
  readonly hideLabel?: boolean;
  readonly value: string;
  /** Se invoca al confirmar (Enter o salir del campo) si el texto cambió y no está vacío. */
  readonly onCommit: (value: string) => void;
  /** Permite confirmar un texto vacío (p. ej. para volver a un nombre automático). */
  readonly allowEmpty?: boolean;
  readonly placeholder?: string;
  readonly hint?: string;
  readonly maxLength?: number;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly testId?: string;
  readonly disabled?: boolean;
}

export function TextField({
  label,
  hideLabel,
  value,
  onCommit,
  allowEmpty = false,
  placeholder,
  hint,
  maxLength = 80,
  className,
  inputClassName,
  testId,
  disabled = false,
}: TextFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    setDraft(value);
  }

  const commit = () => {
    const next = draft.trim();
    if (next === value || (next === '' && !allowEmpty)) setDraft(value);
    else onCommit(next);
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className={cn('text-xs font-medium text-slate-500', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input
        id={id}
        data-testid={testId}
        className={cn(
          'h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
          inputClassName,
        )}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
      />
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
