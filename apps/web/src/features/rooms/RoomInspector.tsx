import {
  deleteRoom,
  formatArea,
  formatLength,
  MIN_ROOM_SIDE,
  moveRoom,
  renameRoom,
  roomEdges,
  roomMetrics,
  roomSides,
  roomsOfWall,
  setRoomSideLength,
  setRoomWallHeight,
  WALL_LIMITS,
  type Level,
  type Room,
} from '@decodeny/domain';
import { Move, MousePointerClick, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoarsePointer } from '@/shared/lib/use-media-query';
import { RoomFurniture } from '@/features/furniture/RoomFurniture';
import { RoomFinishes } from '@/features/materials/RoomFinishes';
import { wallSelectionFrom } from '@/features/walls/wall-context';
import { cn } from '@/shared/lib/cn';
import { Button, IconButton } from '@/shared/ui/Button';
import { LengthField } from '@/shared/ui/LengthField';
import { TextField } from '@/shared/ui/TextField';
import { notify } from '@/state/notifications-store';
import { useProjectStore } from '@/state/project-store';
import { useUiStore } from '@/state/ui-store';
import { useCommand } from '@/state/use-command';

interface RoomInspectorProps {
  readonly level: Level;
  readonly room: Room;
}

export function RoomInspector({ level, room }: RoomInspectorProps) {
  const { t, i18n } = useTranslation();
  const touch = useCoarsePointer();
  const run = useCommand();
  const select = useUiStore((s) => s.select);
  const viewportHover = useUiStore((s) => s.viewportHover);
  const setHighlighted = useUiStore((s) => s.setHighlighted);
  const ref = { levelId: level.id, roomId: room.id };

  const { metrics, sides, heights } = useMemo(() => {
    const edges = roomEdges(level, room);
    const wallsById = new Map(level.walls.map((w) => [w.id, w]));
    return {
      metrics: roomMetrics(level, room),
      sides: roomSides(level, room).map((side) => {
        const names = new Set(side.wallIds.map((id) => wallsById.get(id)?.name));
        const [name] = names;
        return {
          length: Math.round(side.length),
          wallIds: side.wallIds,
          // Nombre propio solo si todos los tramos del lado lo comparten.
          name: names.size === 1 ? name : undefined,
          shared: side.wallIds.some((id) => roomsOfWall(level, id).length > 1),
        };
      }),
      heights: [...new Set(edges.map((e) => e.wall?.height ?? 0))],
    };
  }, [level, room]);
  const hoveredWall = viewportHover?.kind === 'wall' ? viewportHover.id : null;

  const origin = metrics.interiorBounds.min;

  const remove = () => {
    const out = run(deleteRoom, ref);
    if (out.ok) {
      notify('info', t('inspector.deleted', { name: room.name }), {
        label: t('notifications.undo'),
        run: () => useProjectStore.getState().undo(),
      });
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="room-inspector">
      <TextField
        label={t('inspector.name')}
        value={room.name}
        onCommit={(name) => run(renameRoom, { ...ref, name })}
        testId="inspector-room-name"
      />

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
        <div>
          <dt className="text-xs text-slate-500">{t('inspector.area')}</dt>
          <dd className="text-lg font-semibold text-slate-900 tabular-nums" data-testid="room-area">
            {formatArea(metrics.area, i18n.language)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{t('inspector.perimeter')}</dt>
          <dd className="text-lg font-semibold text-slate-900 tabular-nums">
            {formatLength(metrics.perimeter, i18n.language)}
          </dd>
        </div>
      </dl>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          {t('inspector.sides')}
        </legend>
        {sides.map((side, i) => {
          const label = side.name ?? t('inspector.side', { n: i + 1 });
          const hovered = hoveredWall !== null && side.wallIds.includes(hoveredWall);
          const highlight = () =>
            setHighlighted(side.wallIds.map((id) => ({ kind: 'wall' as const, id })));
          return (
            <div
              key={i}
              data-testid={`room-side-row-${i + 1}`}
              data-hovered={hovered || undefined}
              onMouseEnter={highlight}
              onMouseLeave={() => setHighlighted([])}
              onFocus={highlight}
              onBlur={() => setHighlighted([])}
              className={cn(
                '-mx-2 flex items-start gap-1 rounded-lg px-2 py-1 transition-colors',
                hovered ? 'bg-brand-50' : 'hover:bg-slate-50',
              )}
            >
              <LengthField
                className="flex-1"
                label={label}
                value={side.length}
                min={MIN_ROOM_SIDE}
                {...(side.shared ? { hint: t('inspector.sharedSide') } : {})}
                onCommit={(length) =>
                  run(
                    setRoomSideLength,
                    { ...ref, sideIndex: i, length },
                    { coalesceKey: `side:${room.id}:${i}` },
                  )
                }
                testId={`room-side-${i + 1}`}
              />
              {side.wallIds[0] && (
                <IconButton
                  className="mt-5"
                  label={t('inspector.selectWall', { name: label })}
                  onClick={() => select(wallSelectionFrom(level, room, side.wallIds[0]!))}
                >
                  <MousePointerClick className="size-4" />
                </IconButton>
              )}
            </div>
          );
        })}
      </fieldset>

      <LengthField
        label={t('inspector.wallHeight')}
        value={heights[0] ?? 0}
        min={WALL_LIMITS.height.min}
        max={WALL_LIMITS.height.max}
        {...(heights.length > 1 ? { hint: t('inspector.mixed') } : {})}
        onCommit={(height) =>
          run(setRoomWallHeight, { ...ref, height }, { coalesceKey: `height:${room.id}` })
        }
        testId="room-height"
      />

      <RoomFinishes level={level} room={room} />

      <RoomFurniture level={level} room={room} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          {t('inspector.position')}
        </legend>
        <p className="flex gap-2 text-xs text-slate-500">
          <Move className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t(touch ? 'inspector.dragHintTouch' : 'inspector.dragHint')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            label={t('inspector.positionX')}
            value={Math.round(origin.x)}
            step={100}
            onCommit={(x) =>
              run(moveRoom, { ...ref, dx: x - origin.x, dy: 0 }, { coalesceKey: `move:${room.id}` })
            }
          />
          <LengthField
            label={t('inspector.positionY')}
            value={Math.round(origin.y)}
            step={100}
            onCommit={(y) =>
              run(moveRoom, { ...ref, dx: 0, dy: y - origin.y }, { coalesceKey: `move:${room.id}` })
            }
          />
        </div>
      </fieldset>

      <Button
        variant="danger"
        icon={<Trash2 className="size-4" />}
        onClick={remove}
        data-testid="delete-room"
      >
        {t('inspector.delete')}
      </Button>
    </div>
  );
}
