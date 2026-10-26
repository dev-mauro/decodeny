import {
  distance,
  formatLength,
  MIN_ROOM_SIDE,
  nodePositions,
  renameWall,
  roomSides,
  roomsOfWall,
  setRoomSideLength,
  setWallHeight,
  setWallThickness,
  WALL_LIMITS,
  roomOnWallFace,
  wallFaceTowardRoom,
  type Level,
  type Room,
  type Wall,
  type WallFace,
} from '@decodeny/domain';
import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { LengthField } from '@/shared/ui/LengthField';
import { TextField } from '@/shared/ui/TextField';
import { useUiStore } from '@/state/ui-store';
import { useCommand } from '@/state/use-command';
import { FinishPicker } from '@/features/materials/FinishPicker';
import { WallOpenings } from '@/features/openings/WallOpenings';
import { deleteSelectedWall } from './wall-actions';
import { autoWallName, wallSelectionFrom } from './wall-context';

/** Caras del muro, con la del recinto de contexto primero. */
const faceOrder = (first: WallFace | null): WallFace[] =>
  first === 'right' ? ['right', 'left'] : ['left', 'right'];

interface WallInspectorProps {
  readonly level: Level;
  readonly wall: Wall;
  /** Recinto desde el que se mira el muro (define «Lado n» y el largo interior). */
  readonly contextRoom: Room | undefined;
}

export function WallInspector({ level, wall, contextRoom }: WallInspectorProps) {
  const { t, i18n } = useTranslation();
  const run = useCommand();
  const select = useUiStore((s) => s.select);
  const ref = { levelId: level.id, wallId: wall.id };

  const info = useMemo(() => {
    const positions = nodePositions(level);
    const axis = distance(positions.get(wall.start)!, positions.get(wall.end)!);
    const owners = roomsOfWall(level, wall.id)
      .sort((a, b) => Number(b.id === contextRoom?.id) - Number(a.id === contextRoom?.id))
      .map((room) => ({ room, label: autoWallName(t, level, wall.id, room) }));
    const sideIndex = contextRoom
      ? roomSides(level, contextRoom).findIndex((s) => s.wallIds.includes(wall.id))
      : -1;
    const side = contextRoom && sideIndex >= 0 ? roomSides(level, contextRoom)[sideIndex] : null;
    return {
      axis,
      owners,
      sideIndex,
      interior: side ? Math.round(side.length) : 0,
      autoName: autoWallName(t, level, wall.id, contextRoom),
    };
  }, [contextRoom, level, t, wall]);

  return (
    <div className="flex flex-col gap-5" data-testid="wall-inspector">
      <TextField
        label={t('inspector.wallName')}
        value={wall.name ?? ''}
        placeholder={info.autoName}
        allowEmpty
        hint={t('inspector.wallNameHint')}
        onCommit={(name) => run(renameWall, { ...ref, name })}
        testId="wall-name"
      />

      {info.owners.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-slate-500">
            {info.owners.length > 1 ? t('inspector.sharedBy') : t('inspector.ofRoom')}
          </p>
          <ul className="flex flex-col gap-1" data-testid="wall-owners">
            {info.owners.map(({ room, label }) => {
              const current = room.id === contextRoom?.id;
              return (
                <li key={room.id} className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    className="font-medium text-brand-600 hover:underline"
                    onClick={() => select({ kind: 'room', id: room.id })}
                  >
                    {room.name}
                  </button>
                  <button
                    type="button"
                    title={t('inspector.viewFrom', { room: room.name })}
                    onClick={() => select(wallSelectionFrom(level, room, wall.id))}
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-xs tabular-nums transition-colors',
                      current ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100',
                    )}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {contextRoom && info.sideIndex >= 0 && (
        <LengthField
          label={t('inspector.interiorLengthIn', { room: contextRoom.name })}
          value={info.interior}
          min={MIN_ROOM_SIDE}
          onCommit={(length) =>
            run(
              setRoomSideLength,
              { levelId: level.id, roomId: contextRoom.id, sideIndex: info.sideIndex, length },
              { coalesceKey: `side:${contextRoom.id}:${info.sideIndex}` },
            )
          }
          testId="wall-interior-length"
        />
      )}

      <dl className="rounded-xl bg-slate-50 p-3">
        <dt className="text-xs text-slate-500">{t('inspector.axisLength')}</dt>
        <dd className="text-sm font-semibold text-slate-800 tabular-nums">
          {formatLength(info.axis, i18n.language)}
        </dd>
      </dl>

      <div className="grid grid-cols-2 gap-2">
        <LengthField
          label={t('inspector.height')}
          value={wall.height}
          min={WALL_LIMITS.height.min}
          max={WALL_LIMITS.height.max}
          onCommit={(height) =>
            run(setWallHeight, { ...ref, height }, { coalesceKey: `wh:${wall.id}` })
          }
          testId="wall-height"
        />
        <LengthField
          label={t('inspector.thickness')}
          value={wall.thickness}
          min={WALL_LIMITS.thickness.min}
          max={WALL_LIMITS.thickness.max}
          step={5}
          onCommit={(thickness) =>
            run(setWallThickness, { ...ref, thickness }, { coalesceKey: `wt:${wall.id}` })
          }
          testId="wall-thickness"
        />
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="wall-finishes-title">
        <h3
          id="wall-finishes-title"
          className="text-xs font-semibold tracking-wide text-slate-400 uppercase"
        >
          {t('finishes.title')}
        </h3>
        {faceOrder(contextRoom ? wallFaceTowardRoom(level, contextRoom, wall.id) : null).map(
          (face) => {
            const room = roomOnWallFace(level, wall.id, face);
            return (
              <FinishPicker
                key={face}
                level={level}
                label={room ? t('finishes.face', { room: room.name }) : t('finishes.faceOutside')}
                surface="wall"
                targets={[{ kind: 'wall', wallId: wall.id, face }]}
                testId={`finish-face-${room ? 'room' : 'outside'}-${face}`}
              />
            );
          },
        )}
      </section>

      <WallOpenings
        level={level}
        wall={wall}
        contextFace={contextRoom ? wallFaceTowardRoom(level, contextRoom, wall.id) : null}
      />

      <div className="flex flex-col gap-1.5">
        <Button
          variant="danger"
          icon={<Trash2 className="size-4" />}
          onClick={deleteSelectedWall}
          data-testid="delete-wall"
        >
          {t('inspector.deleteWall')}
        </Button>
        {info.owners.length > 0 && (
          <p className="text-xs text-slate-500">{t('inspector.deleteWallHint')}</p>
        )}
      </div>
    </div>
  );
}
