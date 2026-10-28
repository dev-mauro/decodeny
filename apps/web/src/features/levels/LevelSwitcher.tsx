import { CopyPlus, Layers, Plus, Settings2, SquareDashed, SquareStack, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { LengthField } from '@/shared/ui/LengthField';
import { MenuButton } from '@/shared/ui/MenuButton';
import { TextField } from '@/shared/ui/TextField';
import { useProjectStore, useReadOnly } from '@/state/project-store';
import { useActiveLevel } from '@/state/ui-store';
import {
  addLevelAbove,
  removeActiveLevel,
  renameActiveLevel,
  setActiveLevelElevation,
  switchLevel,
} from './level-actions';

const item =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100';

/**
 * Planta en la que se trabaja: elegirla, agregar otra (vacía, con el contorno de esta o igual a
 * ella) y ajustar su nombre y la altura de su piso. Va arriba del panel «Espacios».
 */
export function LevelSwitcher() {
  const { t } = useTranslation();
  const levels = useProjectStore((s) => s.project.levels);
  const level = useActiveLevel();
  const readOnly = useReadOnly();
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 px-3 py-2">
      <Layers className="size-4 shrink-0 text-slate-400" aria-hidden />
      <label className="min-w-0 flex-1">
        <span className="sr-only">{t('levels.select')}</span>
        <select
          className="h-8 w-full rounded-md border border-slate-300 bg-white px-1.5 text-sm font-medium text-slate-800"
          value={level.id}
          onChange={(e) => switchLevel(e.target.value)}
          data-testid="level-select"
        >
          {/* De arriba hacia abajo, como se ven los pisos de un edificio. */}
          {[...levels].reverse().map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {!readOnly && (
        <MenuButton
          label={t('levels.add')}
          icon={<Plus className="size-4" />}
          testId="level-add"
          panelClassName="w-64 gap-0.5"
        >
          {(close) =>
            (
              [
                ['empty', SquareDashed, 'levels.addEmpty'],
                ['outline', SquareStack, 'levels.addOutline'],
                ['duplicate', CopyPlus, 'levels.duplicate'],
              ] as const
            ).map(([kind, Icon, label]) => (
              <button
                key={kind}
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  close();
                  addLevelAbove(kind);
                }}
                data-testid={`level-add-${kind}`}
              >
                <Icon className="size-4 text-slate-500" aria-hidden />
                {t(label)}
              </button>
            ))
          }
        </MenuButton>
      )}
      {!readOnly && (
        <MenuButton
          label={t('levels.settings')}
          icon={<Settings2 className="size-4" />}
          testId="level-settings"
          panelClassName="w-64 gap-3 p-3"
        >
          {(close) => (
            <>
              <TextField
                label={t('levels.name')}
                value={level.name}
                maxLength={80}
                onCommit={renameActiveLevel}
                testId="level-name"
              />
              <LengthField
                label={t('levels.elevation')}
                value={level.elevation}
                min={-20_000}
                max={200_000}
                step={100}
                onCommit={setActiveLevelElevation}
                testId="level-elevation"
              />
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="size-4" />}
                disabled={levels.length <= 1}
                onClick={() => {
                  close();
                  setConfirmRemove(true);
                }}
                data-testid="level-remove"
              >
                {t('levels.remove')}
              </Button>
            </>
          )}
        </MenuButton>
      )}
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t('levels.removeTitle', { name: level.name })}
        description={t('levels.removeBody')}
        confirmLabel={t('levels.removeConfirm')}
        cancelLabel={t('io.cancel')}
        onConfirm={removeActiveLevel}
      />
    </div>
  );
}
