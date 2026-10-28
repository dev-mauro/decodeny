import {
  addLevel,
  duplicateLevel,
  removeLevel,
  renameLevel,
  setLevelElevation,
} from '@decodeny/domain';
import { i18next } from '@/i18n';
import { useProjectStore } from '@/state/project-store';
import { runCommand } from '@/state/use-command';
import { activeLevel, useUiStore } from '@/state/ui-store';

/** Plantas: cambiar la activa, agregar, ajustar y eliminar (acciones fuera de React). */

const project = () => useProjectStore.getState().project;
const current = () => activeLevel(project(), useUiStore.getState().levelId);

/** Cambia la planta en la que se trabaja (lo seleccionado era de la otra). */
export function switchLevel(levelId: string): void {
  if (levelId === current().id) return;
  useUiStore.setState({
    levelId,
    selection: null,
    selectionGroup: [],
    measurePoints: [],
    highlighted: [],
  });
}

/** Planta de arriba (`+1`) o de abajo (`−1`), si la hay. */
export function stepLevel(delta: 1 | -1): void {
  const levels = project().levels;
  const index = levels.findIndex((l) => l.id === current().id);
  const next = levels[index + delta];
  if (next) switchLevel(next.id);
}

const defaultName = () => i18next.t('levels.defaultName', { n: project().levels.length + 1 });

/** Agrega una planta sobre la más alta (vacía, con el contorno de la activa o igual a ella). */
export function addLevelAbove(kind: 'empty' | 'outline' | 'duplicate'): void {
  const name = defaultName();
  const out =
    kind === 'duplicate'
      ? runCommand(duplicateLevel, { levelId: current().id, name })
      : runCommand(addLevel, {
          name,
          ...(kind === 'outline' ? { copyOutlineFrom: current().id } : {}),
        });
  if (out.ok) switchLevel(out.result.levelId);
}

export function renameActiveLevel(name: string): void {
  runCommand(renameLevel, { levelId: current().id, name });
}

export function setActiveLevelElevation(elevation: number): void {
  runCommand(setLevelElevation, { levelId: current().id, elevation });
}

export function removeActiveLevel(): void {
  const level = current();
  const levels = project().levels;
  const index = levels.findIndex((l) => l.id === level.id);
  const fallback = levels[index - 1] ?? levels[index + 1];
  const out = runCommand(removeLevel, { levelId: level.id });
  if (out.ok && fallback) switchLevel(fallback.id);
}
