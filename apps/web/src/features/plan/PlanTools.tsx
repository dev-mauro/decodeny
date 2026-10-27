import { MousePointer2, PenLine, ScanSearch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WalkFromPointButton } from '@/features/navigation/WalkFromPointButton';
import { detectRoomsFromWalls } from '@/features/walls/wall-actions';
import { cn } from '@/shared/lib/cn';
import { IconButton } from '@/shared/ui/Button';
import { ToolHint } from '@/shared/ui/ToolHint';
import { useUiStore } from '@/state/ui-store';

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'viewport.toolSelect' },
  { id: 'wall', icon: PenLine, label: 'viewport.toolWall' },
] as const;

/** Herramientas de la planta 2D: seleccionar/mover o dibujar muros, y detectar recintos. */
export function PlanTools() {
  const { t } = useTranslation();
  const tool = useUiStore((s) => s.planTool);
  const setTool = useUiStore((s) => s.setPlanTool);
  return (
    <div className="flex gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
      <div role="radiogroup" aria-label={t('viewport.planTools')} className="flex gap-1">
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={tool === id}
            aria-label={t(label)}
            title={t(label)}
            onClick={() => setTool(id)}
            data-testid={`plan-tool-${id}`}
            className={cn(
              'flex size-8 items-center justify-center rounded-lg transition-colors',
              tool === id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
      <IconButton
        label={t('viewport.detectRooms')}
        onClick={detectRoomsFromWalls}
        data-testid="detect-rooms"
      >
        <ScanSearch className="size-4" />
      </IconButton>
      <WalkFromPointButton />
    </div>
  );
}

/** Indicaciones mientras se dibujan muros. */
export function WallDrawHint() {
  const { t } = useTranslation();
  const active = useUiStore(
    (s) => s.view === 'plan' && s.planTool === 'wall' && s.placement === null,
  );
  if (!active) return null;
  return <ToolHint text={t('viewport.wallHint')} testId="wall-draw-hint" />;
}
