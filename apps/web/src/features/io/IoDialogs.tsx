import { PROJECT_FILE_EXTENSION } from '@decodeny/domain';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Dialog } from '@/shared/ui/Dialog';
import { useIoStore } from './io-store';
import { openProjectFile, startNewProject } from './project-actions';

/** Input de archivo oculto y diálogos de confirmación/errores de las acciones de archivo. */
export function IoDialogs() {
  const { t } = useTranslation();
  const importError = useIoStore((s) => s.importError);
  const setImportError = useIoStore((s) => s.setImportError);
  const confirmation = useIoStore((s) => s.confirmation);
  const setConfirmation = useIoStore((s) => s.setConfirmation);
  const registerFileInput = useIoStore((s) => s.registerFileInput);

  return (
    <>
      <input
        ref={registerFileInput}
        type="file"
        accept={`${PROJECT_FILE_EXTENSION},.json,application/json,.zip,application/zip`}
        className="hidden"
        data-testid="file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void openProjectFile(file);
        }}
      />

      <ConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => !open && setConfirmation(null)}
        title={t('io.newConfirmTitle')}
        description={t('io.newConfirmBody')}
        confirmLabel={t('io.newConfirm')}
        cancelLabel={t('io.cancel')}
        onConfirm={startNewProject}
      />

      <Dialog
        open={importError !== null}
        onOpenChange={(open) => !open && setImportError(null)}
        title={t('io.importErrorTitle')}
        size="sm"
        closeLabel={t('io.close')}
        footer={<Button onClick={() => setImportError(null)}>{t('io.close')}</Button>}
      >
        <p className="text-sm text-slate-700" data-testid="import-error">
          {importError?.summary}
        </p>
        {importError && importError.details.length > 0 && (
          <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 font-mono text-xs text-slate-500">
            {importError.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
