import {
  checkIntegrity,
  createEmptyProject,
  createId,
  DomainError,
  EMPTY_HISTORY,
  executeCommand,
  isDomainError,
  recordEntry,
  redo as redoHistory,
  undo as undoHistory,
  type Command,
  type HistoryState,
  type Patch,
  type Project,
} from '@decodeny/domain';
import { create } from 'zustand';
import { GENERATOR } from '@/config';
import { i18next } from '@/i18n';

export type DispatchResult<R> =
  { readonly ok: true; readonly result: R } | { readonly ok: false; readonly error: DomainError };

export interface DispatchOptions {
  /** Ediciones consecutivas con la misma clave se deshacen juntas (p. ej. flechas en un campo). */
  readonly coalesceKey?: string;
}

/** Edición continua en curso (p. ej. arrastrar): se previsualiza sin tocar el historial. */
interface Transaction {
  readonly base: Project;
  readonly type: string | null;
  readonly patches: readonly Patch[];
  readonly inverse: readonly Patch[];
}

interface ProjectState {
  readonly project: Project;
  /**
   * Solo lectura: ningún comando ni vista previa modifica el documento (tampoco deshacer). Abrir
   * otro proyecto sí se permite. Se recuerda en el navegador.
   */
  readonly readOnly: boolean;
  readonly setReadOnly: (readOnly: boolean) => void;
  readonly history: HistoryState;
  readonly transaction: Transaction | null;
  readonly dispatch: <A, R>(
    command: Command<A, R>,
    args: A,
    options?: DispatchOptions,
  ) => DispatchResult<R>;
  readonly undo: () => void;
  readonly redo: () => void;
  /** Reemplaza el documento completo (nuevo, abrir, restaurar) y limpia el historial. */
  readonly replace: (project: Project) => void;
  /**
   * Aplica el comando sobre el documento al inicio de la transacción (la abre si hace falta)
   * y muestra el resultado sin registrarlo. Si el comando falla se conserva la última vista.
   */
  readonly preview: <A, R>(command: Command<A, R>, args: A) => DispatchResult<R>;
  /** Registra la transacción como una sola entrada de historial. */
  readonly commitPreview: () => void;
  /** Descarta la transacción y vuelve al documento previo. */
  readonly cancelPreview: () => void;
}

export function newProject(): Project {
  return createEmptyProject({
    name: i18next.t('app.defaultProjectName'),
    levelName: i18next.t('app.defaultLevelName'),
    generator: GENERATOR,
  });
}

const ctx = { ids: createId };

const READ_ONLY_KEY = 'decodeny.readOnly';

function readStoredReadOnly(): boolean {
  try {
    return localStorage.getItem(READ_ONLY_KEY) === '1';
  } catch {
    return false;
  }
}

const readOnlyError = () => new DomainError('read-only', 'El proyecto está en modo solo lectura');

function checkInDev(type: string, project: Project): void {
  if (!import.meta.env.DEV) return;
  const issues = checkIntegrity(project);
  if (issues.length > 0) console.error(`[${type}] dejó el documento inconsistente`, issues);
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: newProject(),
  history: EMPTY_HISTORY,
  transaction: null,
  readOnly: readStoredReadOnly(),

  setReadOnly: (readOnly) => {
    try {
      localStorage.setItem(READ_ONLY_KEY, readOnly ? '1' : '0');
    } catch {
      // Preferencia no persistida: vale para esta sesión.
    }
    // Una vista previa en curso (p. ej. ubicando un mueble) se descarta al bloquear.
    if (readOnly) get().cancelPreview();
    set({ readOnly });
  },

  dispatch: (command, args, options) => {
    if (get().readOnly) return { ok: false, error: readOnlyError() };
    get().cancelPreview();
    const { project, history } = get();
    try {
      const out = executeCommand(project, command, args, ctx);
      checkInDev(command.type, out.project);
      set({
        project: out.project,
        history: recordEntry(history, {
          type: command.type,
          patches: out.patches,
          inverse: out.inverse,
          at: Date.now(),
          ...(options?.coalesceKey ? { coalesceKey: options.coalesceKey } : {}),
        }),
      });
      return { ok: true, result: out.result };
    } catch (error) {
      if (isDomainError(error)) return { ok: false, error };
      throw error;
    }
  },

  undo: () => {
    if (get().readOnly) return;
    get().cancelPreview();
    const out = undoHistory(get().project, get().history);
    if (out) set(out);
  },

  redo: () => {
    if (get().readOnly) return;
    get().cancelPreview();
    const out = redoHistory(get().project, get().history);
    if (out) set(out);
  },

  replace: (project) => {
    set({ project, history: EMPTY_HISTORY, transaction: null });
  },

  preview: (command, args) => {
    if (get().readOnly) return { ok: false, error: readOnlyError() };
    const base = get().transaction?.base ?? get().project;
    try {
      const out = executeCommand(base, command, args, ctx);
      set({
        project: out.project,
        transaction: { base, type: command.type, patches: out.patches, inverse: out.inverse },
      });
      return { ok: true, result: out.result };
    } catch (error) {
      if (!isDomainError(error)) throw error;
      if (!get().transaction) set({ transaction: { base, type: null, patches: [], inverse: [] } });
      return { ok: false, error };
    }
  },

  commitPreview: () => {
    const { transaction, history, project } = get();
    if (!transaction) return;
    if (transaction.type) checkInDev(transaction.type, project);
    set({
      transaction: null,
      history: transaction.type
        ? recordEntry(history, {
            type: transaction.type,
            patches: transaction.patches,
            inverse: transaction.inverse,
            at: Date.now(),
          })
        : history,
    });
  },

  cancelPreview: () => {
    const { transaction } = get();
    if (transaction) set({ project: transaction.base, transaction: null });
  },
}));

export const useProject = () => useProjectStore((s) => s.project);
export const useCanUndo = () => useProjectStore((s) => !s.readOnly && s.history.past.length > 0);
export const useCanRedo = () => useProjectStore((s) => !s.readOnly && s.history.future.length > 0);
export const useReadOnly = () => useProjectStore((s) => s.readOnly);
