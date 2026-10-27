import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { useNotifications, type NotificationKind } from '@/state/notifications-store';

const ICONS: Record<NotificationKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: TriangleAlert,
};

const COLORS: Record<NotificationKind, string> = {
  info: 'text-brand-600',
  success: 'text-emerald-600',
  error: 'text-red-600',
};

export function Toaster() {
  const { t } = useTranslation();
  const items = useNotifications((s) => s.items);
  const dismiss = useNotifications((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-4"
    >
      {items.map((n) => {
        const Icon = ICONS[n.kind];
        return (
          <div
            key={n.id}
            role={n.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg"
          >
            <Icon className={cn('size-5 shrink-0', COLORS[n.kind])} aria-hidden />
            <p className="flex-1 text-slate-700">{n.message}</p>
            {n.action && (
              <button
                type="button"
                className="font-semibold text-brand-600 hover:text-brand-700"
                onClick={() => {
                  n.action?.run();
                  dismiss(n.id);
                }}
              >
                {n.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label={t('notifications.dismiss')}
              className="rounded p-1 text-slate-400 hover:text-slate-700"
              onClick={() => dismiss(n.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
