import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { useUiStore } from '@/state/ui-store';

/** Reemplazo de la vista cuando falla: el proyecto sigue intacto y se puede reintentar. */
export function ViewportError({
  error,
  onRetry,
}: {
  readonly error: Error;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();
  const setView = useUiStore((s) => s.setView);
  return (
    <div
      role="alert"
      className="flex size-full flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center"
      data-testid="viewport-error"
    >
      <TriangleAlert className="size-8 text-amber-500" aria-hidden />
      <h2 className="text-base font-semibold text-slate-900">{t('errors.viewportTitle')}</h2>
      <p className="max-w-sm text-sm text-slate-500">{t('errors.viewportBody')}</p>
      <code className="max-w-md truncate rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">
        {error.message}
      </code>
      <div className="flex gap-2">
        <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={onRetry}>
          {t('errors.retry')}
        </Button>
        <Button onClick={() => setView('plan')}>{t('errors.usePlan')}</Button>
      </div>
    </div>
  );
}
