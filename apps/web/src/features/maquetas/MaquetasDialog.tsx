import { Copy as CopyIcon, FilePlus2, Link2, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { newProject } from '@/state/project-store';
import { cn } from '@/shared/lib/cn';
import { Button, IconButton } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Dialog } from '@/shared/ui/Dialog';
import type { MaquetaSummary } from './maqueta-repository';
import { maquetas, useMaquetas } from './maquetas';
import { useMaquetasUi } from './maquetas-ui';

function when(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function Row({
  maqueta,
  current,
  onDelete,
}: {
  readonly maqueta: MaquetaSummary;
  readonly current: boolean;
  readonly onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const close = () => useMaquetasUi.setState({ listOpen: false });
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2',
        current ? 'border-brand-300 bg-brand-50' : 'border-slate-200',
      )}
      data-testid="maqueta-row"
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-start text-left"
        onClick={() => {
          close();
          if (!current) void maquetas.open(maqueta.id);
        }}
        data-testid="maqueta-open"
      >
        <span className="w-full truncate text-sm font-medium text-slate-900">{maqueta.name}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {t('maquetas.edited', { when: when(maqueta.updatedAt, i18n.language) })}
          {current && <Badge tone="brand">{t('maquetas.current')}</Badge>}
          {maqueta.cloud && (
            <Badge tone="green" icon={<Link2 className="size-3" aria-hidden />}>
              {t('maquetas.shared')}
            </Badge>
          )}
          {maqueta.forkOf && (
            <Badge tone="slate" icon={<CopyIcon className="size-3" aria-hidden />}>
              {t('maquetas.fork')}
            </Badge>
          )}
        </span>
      </button>
      <IconButton label={t('maquetas.delete')} onClick={onDelete} data-testid="maqueta-delete">
        <Trash2 className="size-4" />
      </IconButton>
    </li>
  );
}

function Badge({
  tone,
  icon,
  children,
}: {
  readonly tone: 'brand' | 'green' | 'slate';
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}) {
  const tones = {
    brand: 'bg-brand-100 text-brand-800',
    green: 'bg-emerald-100 text-emerald-800',
    slate: 'bg-slate-100 text-slate-700',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium',
        tones[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function MaquetasDialog() {
  const { t } = useTranslation();
  const open = useMaquetasUi((s) => s.listOpen);
  const list = useMaquetas((s) => s.maquetas);
  const binding = useMaquetas((s) => s.binding);
  const [deleting, setDeleting] = useState<MaquetaSummary | null>(null);
  const close = () => useMaquetasUi.setState({ listOpen: false });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => useMaquetasUi.setState({ listOpen: next })}
        title={t('maquetas.title')}
        description={t('maquetas.description')}
        closeLabel={t('io.close')}
        footer={
          <Button
            variant="primary"
            icon={<FilePlus2 className="size-4" />}
            onClick={() => {
              close();
              maquetas.newDraft(newProject());
            }}
            data-testid="maqueta-new"
          >
            {t('maquetas.new')}
          </Button>
        }
      >
        {list.length === 0 ? (
          <p className="text-sm text-slate-500" data-testid="maquetas-empty">
            {t('maquetas.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="maquetas-list">
            {list.map((m) => (
              <Row
                key={m.id}
                maqueta={m}
                current={binding.kind === 'maqueta' && binding.id === m.id}
                onDelete={() => setDeleting(m)}
              />
            ))}
          </ul>
        )}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={t('maquetas.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('maquetas.deleteBody')}
        confirmLabel={t('maquetas.deleteConfirm')}
        cancelLabel={t('io.cancel')}
        onConfirm={() => {
          if (deleting) void maquetas.remove(deleting.id);
        }}
      />
    </>
  );
}
