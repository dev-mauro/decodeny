import { IMAGE_MIME_TYPES } from '@decodeny/domain';
import { ImagePlus, X } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssetStore } from '@/features/assets/asset-store';
import { IconButton } from '@/shared/ui/Button';

interface ImageFieldProps {
  readonly label: string;
  readonly assetId: string;
  readonly onFile: (file: File) => void;
  readonly onClear: () => void;
  readonly testId?: string;
}

/** Imagen del usuario: vista previa, subir/reemplazar y quitar. */
export function ImageField({ label, assetId, onFile, onClear, testId }: ImageFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const url = useAssetStore((s) => (assetId ? s.urls[assetId] : undefined));

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {url ? (
            <img
              src={url}
              alt=""
              className="size-full object-cover"
              data-testid={`${testId}-preview`}
            />
          ) : (
            <ImagePlus className="size-5 text-slate-300" aria-hidden />
          )}
        </div>
        <label
          htmlFor={id}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {assetId ? t('assets.replace') : t('assets.upload')}
        </label>
        <input
          id={id}
          type="file"
          accept={IMAGE_MIME_TYPES.join(',')}
          className="sr-only"
          data-testid={testId}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
        {assetId && (
          <IconButton label={t('assets.remove')} onClick={onClear}>
            <X className="size-4" />
          </IconButton>
        )}
      </div>
      <p className="text-xs text-slate-400">{t('assets.hint')}</p>
    </div>
  );
}
