import { Cloud, CloudOff, Eye, Loader2, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { CopyBox } from '@/shared/ui/CopyBox';
import { Dialog } from '@/shared/ui/Dialog';
import type { CloudStatus } from './maqueta-session';
import { maquetas, shareUrl, useMaquetas } from './maquetas';
import { useMaquetasUi } from './maquetas-ui';

const STATUS_ICON: Record<CloudStatus, typeof Cloud> = {
  local: Cloud,
  saving: Loader2,
  saved: Cloud,
  offline: CloudOff,
  error: CloudOff,
};

/** Compartir la maqueta abierta (solo si la nube está configurada). Muestra su estado. */
export function ShareButton() {
  const { t } = useTranslation();
  const status = useMaquetas((s) => s.cloud);
  const shared = useMaquetas((s) => s.houseId !== null && s.binding.kind === 'maqueta');
  if (!maquetas.cloudEnabled) return null;
  const Icon = shared ? STATUS_ICON[status] : Share2;
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={
        <Icon
          className={cn(
            'size-4',
            status === 'saving' && 'animate-spin',
            shared && status === 'saved' && 'text-emerald-600',
            shared && (status === 'offline' || status === 'error') && 'text-amber-600',
          )}
        />
      }
      title={shared ? t(`share.status.${status}`) : t('share.button')}
      onClick={() => useMaquetasUi.setState({ shareOpen: true })}
      data-testid="share-open"
      data-cloud-status={shared ? status : undefined}
    >
      <span className="hidden lg:inline">{t('share.button')}</span>
    </Button>
  );
}

/** Aviso en la barra mientras se mira la maqueta compartida de otra persona. */
export function VisitBadge() {
  const { t } = useTranslation();
  const visiting = useMaquetas((s) => s.binding.kind === 'visit');
  if (!visiting) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800"
      title={t('maquetas.visitingHint')}
      data-testid="visit-badge"
    >
      <Eye className="size-3" aria-hidden />
      <span className="hidden sm:inline">{t('maquetas.visiting')}</span>
    </span>
  );
}

export function ShareDialog() {
  const { t } = useTranslation();
  const open = useMaquetasUi((s) => s.shareOpen);
  const binding = useMaquetas((s) => s.binding);
  const houseId = useMaquetas((s) => (s.binding.kind === 'maqueta' ? s.houseId : null));
  const status = useMaquetas((s) => s.cloud);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const share = () => {
    setBusy(true);
    setFailed(false);
    maquetas
      .share()
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => useMaquetasUi.setState({ shareOpen: next })}
      title={t('share.title')}
      size="sm"
      closeLabel={t('io.close')}
      footer={
        houseId === null && binding.kind !== 'guest' ? (
          <Button
            variant="primary"
            icon={
              busy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />
            }
            disabled={busy}
            onClick={share}
            data-testid="share-confirm"
          >
            {t(busy ? 'share.sharing' : 'share.confirm')}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 text-sm text-slate-700" data-testid="share-dialog">
        {binding.kind === 'guest' ? (
          <p>{t('share.guest')}</p>
        ) : houseId === null ? (
          <>
            <p>{t('share.intro')}</p>
            {binding.kind === 'visit' && <p className="font-medium">{t('share.visitFirst')}</p>}
            <ul className="flex list-disc flex-col gap-1 pl-5 text-slate-600">
              <li>{t('share.rules')}</li>
              <li>{t('share.expiry')}</li>
              <li>{t('share.privacy')}</li>
            </ul>
            {failed && (
              <p className="text-red-600" role="alert" data-testid="share-error">
                {t('share.failed')}
              </p>
            )}
          </>
        ) : (
          <>
            <CopyBox
              label={t('share.link')}
              value={shareUrl(houseId)}
              testId="share-link"
              copyLabel={t('share.copy')}
              copiedLabel={t('share.copied')}
              rows={2}
            />
            <p className="text-slate-600" data-testid="share-status">
              {t(`share.status.${status}`)} · {t('share.synced')}
            </p>
            <p className="text-xs text-slate-500">{t('share.expiry')}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
