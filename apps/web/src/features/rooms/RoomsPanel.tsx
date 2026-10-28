import { formatArea, roomMetrics } from '@decodeny/domain';
import { Plus, Square } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { useReadOnly } from '@/state/project-store';
import { useActiveLevel, useUiStore } from '@/state/ui-store';
import { LevelSwitcher } from '../levels/LevelSwitcher';

export function RoomsPanel() {
  const { t, i18n } = useTranslation();
  const level = useActiveLevel();
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const openCreate = useUiStore((s) => s.setCreateRoomOpen);
  const readOnly = useReadOnly();
  const viewportHover = useUiStore((s) => s.viewportHover);
  const setHighlighted = useUiStore((s) => s.setHighlighted);

  const rooms = useMemo(
    () => level.rooms.map((room) => ({ room, area: roomMetrics(level, room).area })),
    [level],
  );
  // Lo no habitable (encerrado, clóset empotrado) no suma a la superficie útil.
  const total = rooms.reduce((sum, r) => sum + (r.room.uninhabitable ? 0 : r.area), 0);

  return (
    <section aria-labelledby="rooms-title" className="flex min-h-0 flex-1 flex-col">
      <LevelSwitcher />
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 id="rooms-title" className="text-sm font-semibold text-slate-900">
          {t('rooms.title')}
        </h2>
        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="size-4" />}
          onClick={() => openCreate(true)}
          disabled={readOnly}
          data-testid="add-room"
        >
          {t('rooms.add')}
        </Button>
      </header>
      {rooms.length === 0 ? (
        <p className="px-4 py-2 text-sm text-slate-500">{t('rooms.none')}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" data-testid="rooms-list">
          {rooms.map(({ room, area }) => {
            const active = selection?.kind === 'room' && selection.id === room.id;
            const hovered = viewportHover?.kind === 'room' && viewportHover.id === room.id;
            return (
              <li key={room.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  data-hovered={hovered || undefined}
                  onClick={() => select({ kind: 'room', id: room.id })}
                  onMouseEnter={() => setHighlighted([{ kind: 'room', id: room.id }])}
                  onMouseLeave={() => setHighlighted([])}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : hovered
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-100',
                  )}
                >
                  <Square className="size-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{room.name}</span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {room.uninhabitable
                      ? t('rooms.uninhabitable')
                      : formatArea(area, i18n.language)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {rooms.length > 0 && (
        <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          <span>{t('rooms.totalArea')}</span>
          <span className="font-semibold text-slate-800 tabular-nums" data-testid="total-area">
            {formatArea(total, i18n.language)}
          </span>
        </footer>
      )}
    </section>
  );
}
