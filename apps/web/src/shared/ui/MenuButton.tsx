import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { IconButton } from './Button';

interface MenuButtonProps {
  readonly label: string;
  readonly icon: ReactNode;
  readonly testId: string;
  /** Contenido del panel; recibe `close` para cerrarlo tras una acción. */
  readonly children: (close: () => void) => ReactNode;
  readonly className?: string;
  readonly panelClassName?: string;
}

/** Botón con un panel desplegable que se cierra al tocar fuera o con Esc. */
export function MenuButton({
  label,
  icon,
  testId,
  children,
  className,
  panelClassName,
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div ref={root} className={cn('relative', className)}>
      <IconButton
        label={label}
        aria-expanded={open}
        aria-pressed={open}
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
      >
        {icon}
      </IconButton>
      {open && (
        <div
          className={cn(
            'absolute top-10 right-0 z-40 flex flex-col rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg',
            panelClassName,
          )}
          data-testid={`${testId}-panel`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
