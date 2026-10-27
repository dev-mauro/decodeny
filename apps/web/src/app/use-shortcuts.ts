import { deleteOpening, deleteRoom } from '@decodeny/domain';
import { useEffect } from 'react';
import { exportCurrentProject, requestOpenFile } from '@/features/io/project-actions';
import { useProjectStore } from '@/state/project-store';
import {
  copySelectedItems,
  deleteSelectedItems,
  duplicateSelectedItems,
  nudgeSelectedItems,
  pasteItemsFromClipboard,
  rotateSelectedItems,
  selectAllItems,
} from '@/features/furniture/item-actions';
import { MODE_ORDER } from '@/features/navigation/mode-order';
import { deleteSelectedWall } from '@/features/walls/wall-actions';
import { cancelPlacement, confirmPlacement, rotatePlacement } from '@/features/furniture/placement';
import { activeLevel, useUiStore } from '@/state/ui-store';

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const hasOpenDialog = (): boolean => document.querySelector('[role="dialog"]') !== null;

function switchMode(digit: string): void {
  const mode = MODE_ORDER[Number(digit) - 1];
  const ui = useUiStore.getState();
  if (!mode) return;
  const project = useProjectStore.getState().project;
  if (mode === 'person' && activeLevel(project, ui.levelId).rooms.length === 0) return;
  ui.setNavigationMode(mode);
}

/** Atajos globales de teclado. Se ignoran mientras se escribe en un campo o hay un diálogo. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target) || hasOpenDialog()) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const store = useProjectStore.getState();

      // Ubicando un item nuevo: Enter lo deja, Esc cancela, R gira. Enter no activa el botón
      // del catálogo que tiene el foco.
      if (useUiStore.getState().placement && !mod) {
        if (key === 'enter' || key === 'escape' || key === 'r') {
          e.preventDefault();
          if (key === 'enter') confirmPlacement();
          else if (key === 'escape') cancelPlacement();
          else rotatePlacement(e.shiftKey ? -90 : 90);
          return;
        }
      }

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        store.redo();
      } else if (mod && key === 's') {
        e.preventDefault();
        exportCurrentProject();
      } else if (mod && key === 'o') {
        e.preventDefault();
        requestOpenFile();
      } else if (useUiStore.getState().navigationMode !== 'edit') {
        // En recorrido, Esc libera el mouse (navegador); un segundo Esc vuelve a edición.
        // Los atajos de edición siguientes no aplican.
        if (key === 'escape') useUiStore.getState().setNavigationMode('edit');
        else if (!mod && /^[1-9]$/.test(e.key)) switchMode(e.key);
      } else if (mod && key === 'd') {
        if (duplicateSelectedItems()) e.preventDefault();
      } else if (mod && key === 'a') {
        if (selectAllItems()) e.preventDefault();
      } else if (mod && key === 'c') {
        copySelectedItems();
      } else if (mod && key === 'v') {
        if (pasteItemsFromClipboard()) e.preventDefault();
      } else if (!mod && key === 'p') {
        const ui = useUiStore.getState();
        ui.setView(ui.view === 'plan' ? '3d' : 'plan');
      } else if (!mod && key === 'w') {
        const ui = useUiStore.getState();
        ui.setPlanTool(ui.view === 'plan' && ui.planTool === 'wall' ? 'select' : 'wall');
      } else if (!mod && key === 'm') {
        const ui = useUiStore.getState();
        ui.setMeasuring(!ui.measuring);
      } else if (!mod && key === 'r') {
        rotateSelectedItems(e.shiftKey ? -90 : 90);
      } else if (!mod && e.key.startsWith('Arrow')) {
        // Empuja el mueble seleccionado 1 cm (10 cm con Shift); arriba = norte de la planta.
        const step = e.shiftKey ? 100 : 10;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
        if (nudgeSelectedItems(dx, dy)) e.preventDefault();
      } else if (key === 'escape') {
        const ui = useUiStore.getState();
        if (ui.measuring) ui.setMeasuring(false);
        else ui.select(null);
      } else if (!mod && /^[1-9]$/.test(e.key)) {
        switchMode(e.key);
      } else if (key === 'delete' || key === 'backspace') {
        const { selection, levelId, navigationMode } = useUiStore.getState();
        if (navigationMode !== 'edit' || !selection) return;
        const level = activeLevel(store.project, levelId).id;
        if (selection.kind === 'room') {
          e.preventDefault();
          store.dispatch(deleteRoom, { levelId: level, roomId: selection.id });
        } else if (selection.kind === 'opening') {
          e.preventDefault();
          store.dispatch(deleteOpening, { levelId: level, openingId: selection.id });
        } else if (selection.kind === 'item') {
          e.preventDefault();
          deleteSelectedItems();
        } else {
          e.preventDefault();
          deleteSelectedWall();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
