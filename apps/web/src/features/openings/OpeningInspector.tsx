import { openingCatalog, resolveOpeningDefinition, unknownOpening } from '@decodeny/catalog';
import {
  deleteOpening,
  localize,
  openingGaps,
  openingOffsetForGap,
  resolveParams,
  roomsOfWall,
  updateOpening,
  wallFaceTowardRoom,
  type Level,
  type Opening,
  type WallFace,
} from '@decodeny/domain';
import { Move, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { autoWallName, wallSelectionFrom } from '@/features/walls/wall-context';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { LengthField } from '@/shared/ui/LengthField';
import { notify } from '@/state/notifications-store';
import { useProjectStore } from '@/state/project-store';
import { useUiStore } from '@/state/ui-store';
import { useCommand } from '@/state/use-command';
import { ParamField } from '@/features/catalog/ParamField';

interface OpeningInspectorProps {
  readonly level: Level;
  readonly opening: Opening;
}

export function OpeningInspector({ level, opening }: OpeningInspectorProps) {
  const { t, i18n } = useTranslation();
  const run = useCommand();
  const select = useUiStore((s) => s.select);
  const ref = { levelId: level.id, openingId: opening.id };
  const definition = resolveOpeningDefinition(opening.def);
  const known = definition !== unknownOpening;
  const params = resolveParams(definition.params, opening.params);

  // Recintos a cada lado del muro: las medidas se muestran desde uno de ellos.
  const owners = useMemo(
    () =>
      roomsOfWall(level, opening.wallId).flatMap((room) => {
        const face = wallFaceTowardRoom(level, room, opening.wallId);
        return face ? [{ room, face }] : [];
      }),
    [level, opening.wallId],
  );
  const [chosenFace, setChosenFace] = useState<WallFace | null>(null);
  const viewFace: WallFace = chosenFace ?? owners[0]?.face ?? 'left';
  const viewRoom = owners.find((o) => o.face === viewFace)?.room;
  const wall = level.walls.find((w) => w.id === opening.wallId);

  // Vista desde la cara `left`: su extremo `end` queda a la izquierda.
  const gaps = openingGaps(level, opening, viewFace);
  const leftEnd = viewFace === 'left' ? 'end' : 'start';
  const rightEnd = leftEnd === 'end' ? 'start' : 'end';
  const gapOf = (end: 'start' | 'end') => Math.round(gaps ? gaps[end] : 0);
  const setGap = (end: 'start' | 'end', gap: number) => {
    const offset = openingOffsetForGap(level, opening, viewFace, end, gap);
    if (offset !== null)
      run(updateOpening, { ...ref, offset }, { coalesceKey: `og:${opening.id}` });
  };

  const sameKind = openingCatalog.list().filter((d) => d.kind === definition.kind);
  const entries = Object.entries(definition.params);
  const basic = entries.filter(([, spec]) => !spec.advanced);
  const advanced = entries.filter(([, spec]) => spec.advanced);
  const context = { level, wallId: opening.wallId, viewFace };
  const commitParam = (key: string, value: number | string | boolean) =>
    run(
      updateOpening,
      { ...ref, params: { [key]: value } },
      { coalesceKey: `op:${opening.id}:${key}` },
    );

  const remove = () => {
    const name = localize(definition.name, i18n.language);
    const out = run(deleteOpening, ref);
    if (out.ok) {
      notify('info', t('openings.deleted', { name }), {
        label: t('notifications.undo'),
        run: () => useProjectStore.getState().undo(),
      });
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="opening-inspector">
      {!known && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          {t('openings.unknown', { def: opening.def })}
        </p>
      )}

      {known && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">{t('openings.type')}</span>
          <select
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            value={opening.def}
            onChange={(e) => run(updateOpening, { ...ref, def: e.target.value })}
            data-testid="opening-type"
          >
            {sameKind.map((d) => (
              <option key={d.id} value={d.id}>
                {localize(d.name, i18n.language)}
              </option>
            ))}
          </select>
        </label>
      )}

      {wall && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-slate-500">{t('openings.onWall')}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {owners.map(({ room, face }) => (
              <button
                key={room.id}
                type="button"
                className="font-medium text-brand-600 hover:underline"
                onClick={() => select(wallSelectionFrom(level, room, wall.id))}
                data-face={face}
              >
                {room.name} · {wall.name ?? autoWallName(t, level, wall.id, room)}
              </button>
            ))}
          </div>
        </div>
      )}

      {owners.length > 1 && (
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="mb-1 text-xs font-medium text-slate-500">
            {t('openings.viewFrom')}
          </legend>
          <div role="radiogroup" className="flex rounded-lg bg-slate-100 p-0.5">
            {owners.map(({ room, face }) => (
              <button
                key={room.id}
                type="button"
                role="radio"
                aria-checked={face === viewFace}
                onClick={() => setChosenFace(face)}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                  face === viewFace
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {room.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            label={t('openings.gapLeft')}
            value={gapOf(leftEnd)}
            min={0}
            onCommit={(gap) => setGap(leftEnd, gap)}
            testId="opening-gap-left"
          />
          <LengthField
            label={t('openings.gapRight')}
            value={gapOf(rightEnd)}
            min={0}
            onCommit={(gap) => setGap(rightEnd, gap)}
            testId="opening-gap-right"
          />
        </div>
        <p className="flex gap-2 text-xs text-slate-500">
          <Move className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {viewRoom ? t('openings.gapHint') : null} {t('openings.dragHint')}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {basic.map(([key, spec]) => (
          <ParamField
            key={key}
            name={key}
            spec={spec}
            value={params[key]!}
            context={context}
            onCommit={(value) => commitParam(key, value)}
          />
        ))}
      </div>

      {advanced.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-slate-400 uppercase">
            {t('openings.advanced')}
          </summary>
          {advanced.map(([key, spec]) => (
            <ParamField
              key={key}
              name={key}
              spec={spec}
              value={params[key]!}
              context={context}
              onCommit={(value) => commitParam(key, value)}
            />
          ))}
        </details>
      )}

      <Button
        variant="danger"
        icon={<Trash2 className="size-4" />}
        onClick={remove}
        data-testid="delete-opening"
      >
        {t('openings.delete')}
      </Button>
    </div>
  );
}
