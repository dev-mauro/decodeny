import { useTranslation } from 'react-i18next';
import { exportCurrentProject } from '@/features/io/project-actions';
import { Button } from '@/shared/ui/Button';

/**
 * Última red: si la interfaz falla, se ofrece exportar el proyecto (el documento sigue en
 * memoria y en el autoguardado) y recargar.
 */
export function AppCrash({ error }: { readonly error: Error }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-lg font-semibold text-slate-900">{t('errors.appTitle')}</h1>
      <p className="max-w-md text-sm text-slate-500">{t('errors.appBody')}</p>
      <code className="max-w-md truncate rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">
        {error.message}
      </code>
      <div className="flex gap-2">
        <Button variant="primary" onClick={exportCurrentProject}>
          {t('errors.exportNow')}
        </Button>
        <Button onClick={() => window.location.reload()}>{t('errors.reload')}</Button>
      </div>
    </div>
  );
}
