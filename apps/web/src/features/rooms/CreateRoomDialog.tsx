import {
  createRectangularRoom,
  createRoomFromPath,
  MIN_ROOM_SIDE,
  suggestRoomOrigin,
  WALL_LIMITS,
} from '@decodeny/domain';
import * as Tabs from '@radix-ui/react-tabs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { LengthField } from '@/shared/ui/LengthField';
import { TextField } from '@/shared/ui/TextField';
import { useProjectStore } from '@/state/project-store';
import { useActiveLevel, useUiStore } from '@/state/ui-store';
import { useCommand } from '@/state/use-command';
import { PathEditor } from './PathEditor';
import { analyzePath, initialRows, toSegments, type PathRow } from './path-model';

type Mode = 'rect' | 'path';

interface CreateRoomDialogProps {
  /** Se invoca tras crear el recinto (p. ej. para encuadrar la cámara). */
  readonly onCreated?: (roomId: string) => void;
}

export function CreateRoomDialog({ onCreated }: CreateRoomDialogProps) {
  const open = useUiStore((s) => s.createRoomOpen);
  const setOpen = useUiStore((s) => s.setCreateRoomOpen);
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('create.title')}
      description={t('create.description')}
      size="lg"
      closeLabel={t('io.close')}
    >
      {/* Se monta al abrir: cada apertura parte con un formulario limpio. */}
      {open && (
        <CreateRoomForm
          onDone={(roomId) => {
            setOpen(false);
            onCreated?.(roomId);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </Dialog>
  );
}

function CreateRoomForm({
  onDone,
  onCancel,
}: {
  readonly onDone: (roomId: string) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const level = useActiveLevel();
  const settings = useProjectStore((s) => s.project.settings);
  const run = useCommand();
  const select = useUiStore((s) => s.select);

  const [mode, setMode] = useState<Mode>('rect');
  const [name, setName] = useState<string>(() =>
    t('rooms.defaultName', { n: level.rooms.length + 1 }),
  );
  const [width, setWidth] = useState(4000);
  const [depth, setDepth] = useState(3000);
  const [height, setHeight] = useState(settings.defaultWallHeight);
  const [thickness, setThickness] = useState(settings.defaultWallThickness);
  const [rows, setRows] = useState<PathRow[]>(initialRows);
  const analysis = useMemo(() => analyzePath(rows), [rows]);

  const canSubmit = mode === 'rect' || analysis.valid;

  const submit = () => {
    if (!canSubmit) return;
    const common = { levelId: level.id, name, height, thickness, origin: suggestRoomOrigin(level) };
    const out =
      mode === 'rect'
        ? run(createRectangularRoom, { ...common, width, depth })
        : run(createRoomFromPath, { ...common, segments: toSegments(rows) });
    if (out.ok) {
      select({ kind: 'room', id: out.result.roomId });
      onDone(out.result.roomId);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
      aria-label={t('create.title')}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          className="sm:col-span-1"
          label={t('create.name')}
          value={name}
          onCommit={setName}
          testId="room-name"
        />
        <LengthField
          label={t('create.wallHeight')}
          value={height}
          min={WALL_LIMITS.height.min}
          max={WALL_LIMITS.height.max}
          onCommit={setHeight}
          testId="room-wall-height"
        />
        <LengthField
          label={t('create.wallThickness')}
          value={thickness}
          min={WALL_LIMITS.thickness.min}
          max={WALL_LIMITS.thickness.max}
          onCommit={setThickness}
          testId="room-wall-thickness"
        />
      </div>

      <Tabs.Root value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <Tabs.List
          className="mb-4 inline-flex rounded-lg bg-slate-100 p-1"
          aria-label={t('create.title')}
        >
          {(['rect', 'path'] as const).map((m) => (
            <Tabs.Trigger
              key={m}
              value={m}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
            >
              {t(m === 'rect' ? 'create.tabRect' : 'create.tabPath')}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="rect" className="grid max-w-md gap-3 sm:grid-cols-2">
          <LengthField
            label={t('create.width')}
            value={width}
            min={MIN_ROOM_SIDE}
            onCommit={setWidth}
            testId="room-width"
          />
          <LengthField
            label={t('create.depth')}
            value={depth}
            min={MIN_ROOM_SIDE}
            onCommit={setDepth}
            testId="room-depth"
          />
        </Tabs.Content>
        <Tabs.Content value="path">
          <PathEditor rows={rows} onChange={setRows} analysis={analysis} />
        </Tabs.Content>
      </Tabs.Root>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Button onClick={onCancel}>{t('create.cancel')}</Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!canSubmit}
          data-testid="create-room-submit"
        >
          {t('create.submit')}
        </Button>
      </div>
    </form>
  );
}
