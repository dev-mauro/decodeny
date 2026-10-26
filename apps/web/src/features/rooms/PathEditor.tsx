import { formatLength, MIN_ROOM_SIDE } from '@decodeny/domain';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { Button, IconButton } from '@/shared/ui/Button';
import { LengthField } from '@/shared/ui/LengthField';
import { NumericField } from '@/shared/ui/NumericField';
import { PathPreview } from './PathPreview';
import { createRow, type PathAnalysis, type PathRow, type TurnDirection } from './path-model';

interface PathEditorProps {
  readonly rows: readonly PathRow[];
  readonly onChange: (rows: PathRow[]) => void;
  readonly analysis: PathAnalysis;
}

const parseAngle = (text: string): number | null => {
  const n = Number(text.replace(',', '.').replace('°', '').trim());
  return Number.isFinite(n) && text.trim() !== '' ? n : null;
};

export function PathEditor({ rows, onChange, analysis }: PathEditorProps) {
  const { t, i18n } = useTranslation();
  const update = (key: number, patch: Partial<PathRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const message = {
    closed: { text: t('create.pathClosed'), tone: 'text-emerald-700 bg-emerald-50' },
    open: {
      text: t('create.pathOpen', { gap: formatLength(analysis.traced.closingGap, i18n.language) }),
      tone: 'text-amber-800 bg-amber-50',
    },
    'self-intersects': { text: t('create.pathSelfIntersects'), tone: 'text-red-700 bg-red-50' },
    'too-few': { text: t('create.pathTooFew'), tone: 'text-red-700 bg-red-50' },
  }[analysis.status];

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_240px]">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-500">{t('create.pathHelp')}</p>
        <ol className="flex flex-col gap-2" data-testid="path-rows">
          {rows.map((row, index) => {
            const n = index + 1;
            const isLast = index === rows.length - 1;
            return (
              <li
                key={row.key}
                className="grid grid-cols-[2rem_1fr_auto_5rem_auto] items-end gap-2"
              >
                <span className="pb-2 text-xs font-semibold text-slate-400">{n}</span>
                <LengthField
                  label={t('create.segmentLength', { n })}
                  hideLabel={index > 0}
                  value={row.length}
                  min={MIN_ROOM_SIDE}
                  onCommit={(length) => update(row.key, { length })}
                  testId={`segment-length-${n}`}
                />
                <div className={cn('flex flex-col gap-1', isLast && 'invisible')}>
                  {index === 0 && (
                    <span className="text-xs font-medium text-slate-500">{t('create.turn')}</span>
                  )}
                  <select
                    aria-label={`${t('create.turn')} ${n}`}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                    value={row.direction}
                    onChange={(e) =>
                      update(row.key, { direction: e.target.value as TurnDirection })
                    }
                  >
                    <option value="left">{t('create.turnLeft')}</option>
                    <option value="right">{t('create.turnRight')}</option>
                  </select>
                </div>
                <NumericField
                  className={cn(isLast && 'invisible')}
                  label={t('create.turnAngle', { n })}
                  hideLabel
                  value={row.angle}
                  parse={parseAngle}
                  format={(v) => String(v)}
                  invalidMessage={t('field.invalidNumber')}
                  validate={(v) =>
                    v < 0 || v > 180 ? t('field.range', { min: '0°', max: '180°' }) : null
                  }
                  suffix={t('field.unitDegrees')}
                  step={1}
                  onCommit={(angle) => update(row.key, { angle })}
                />
                <IconButton
                  label={t('create.removeSegment', { n })}
                  disabled={rows.length <= 3}
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            );
          })}
        </ol>
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          icon={<Plus className="size-4" />}
          onClick={() => onChange([...rows, createRow(1000)])}
        >
          {t('create.addSegment')}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <PathPreview analysis={analysis} />
        <p role="status" className={cn('rounded-lg px-3 py-2 text-xs', message.tone)}>
          {message.text}
        </p>
      </div>
    </div>
  );
}
