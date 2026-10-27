import {
  checkIntegrity,
  createEmptyProject,
  createId,
  DomainError,
  EMPTY_HISTORY,
  executeCommand,
  isDomainError,
  recordEntry,
  recordingIds,
  redo as redoHistory,
  replayIds,
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

/** Comando ejecutado como datos: lo necesario para reproducirlo en otro equipo. */
export interface CommandOp {
  readonly type: string;
  readonly args: unknown;
  /** Ids generados, en orden (ver `replayIds`). */
  readonly ids: readonly string[];
  readonly coalesceKey?: string;
}

/** Cambio local del documento, ya aplicado. Lo escucha la sesión colaborativa (`ProjectSync`). */
export type ProjectChange =
  | ({ readonly kind: 'command'; readonly patches: readonly Patch[] } & CommandOp)
  | {
      readonly kind: 'history';
      readonly action: 'undo' | 'redo';
      readonly patches: readonly Patch[];
    }
  | { readonly kind: 'replace'; readonly project: Project };

/**
 * Enlace del documento con una sesión colaborativa. Sin sesión, el store funciona solo.
 * `history`: el historial es de la sesión y deshacer/rehacer se delegan (invitados).
 */
export interface ProjectSync {
  readonly onChange: (change: ProjectChange) => void;
  readonly history?: { readonly undo: () => void; readonly redo: () => void };
}

/** Si se puede deshacer y rehacer en el historial compartido de la sesión. */
export interface SharedHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/** Edición continua en curso (p. ej. arrastrar): se previsualiza sin tocar el historial. */
interface Transaction {
  readonly base: Project;
  /** Último comando previsualizado con éxito (`null`: ninguno todavía). */
  readonly op: CommandOp | null;
  readonly command: Command<unknown, unknown> | null;
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
  /** `remember: false`: solo por ahora (p. ej. la presentación), sin tocar la preferencia guardada. */
  readonly setReadOnly: (readOnly: boolean, options?: { readonly remember?: boolean }) => void;
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

  // --- Sesión colaborativa ---
  readonly sync: ProjectSync | null;
  readonly sharedHistory: SharedHistory | null;
  readonly setSync: (sync: ProjectSync | null) => void;
  readonly setSharedHistory: (shared: SharedHistory | null) => void;
  /**
   * Ejecuta una operación de otro participante (anfitrión): mismos ids, entra al historial y no
   * avisa a `sync`. Una vista previa local en curso se rehace sobre el resultado.
   */
  readonly applyRemote: (
    command: Command<unknown, unknown>,
    op: CommandOp,
  ) => DispatchResult<readonly Patch[]>;
  /** Deshace o rehace sin mirar el modo solo lectura (pedido por otro participante). */
  readonly applyHistory: (action: 'undo' | 'redo') => void;
  /**
   * Muestra el documento que dicta la sesión (invitado), sin historial local. Una vista previa en
   * curso se rehace sobre él.
   */
  readonly syncProject: (project: Project) => void;
}

export function newProject(): Project {
  return createEmptyProject({
    name: i18next.t('app.defaultProjectName'),
    levelName: i18next.t('app.defaultLevelName'),
    generator: GENERATOR,
  });
}

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

/** Rehace la vista previa en curso sobre una base nueva (con los mismos ids). */
function rebase(
  transaction: Transaction,
  base: Project,
): Pick<ProjectState, 'project' | 'transaction'> {
  if (transaction.command && transaction.op) {
    try {
      const out = executeCommand(base, transaction.command, transaction.op.args, {
        ids: replayIds(transaction.op.ids),
      });
      return {
        project: out.project,
        transaction: { ...transaction, base, patches: out.patches, inverse: out.inverse },
      };
    } catch (error) {
      if (!isDomainError(error)) throw error;
      // Lo que se arrastraba ya no es válido (p. ej. otro lo borró): se suelta.
    }
  }
  return {
    project: base,
    transaction: { base, op: null, command: null, patches: [], inverse: [] },
  };
}

/** Store del documento. La app usa una sola instancia (`useProjectStore`); los tests, varias. */
export function createProjectStore(initial: Project = newProject()) {
  return create<ProjectState>()((set, get) => {
    /** Registra en el historial local, salvo que el historial sea de la sesión (invitado). */
    const record = (history: HistoryState, entry: Parameters<typeof recordEntry>[1]) =>
      get().sync?.history ? history : recordEntry(history, entry);

    const timeTravel = (action: 'undo' | 'redo') => {
      get().cancelPreview();
      const { project, history, sync } = get();
      const entry = action === 'undo' ? history.past.at(-1) : history.future[0];
      const out = action === 'undo' ? undoHistory(project, history) : redoHistory(project, history);
      if (!out || !entry) return;
      set(out);
      sync?.onChange({
        kind: 'history',
        action,
        patches: action === 'undo' ? entry.inverse : entry.patches,
      });
    };

    return {
      project: initial,
      history: EMPTY_HISTORY,
      transaction: null,
      readOnly: readStoredReadOnly(),
      sync: null,
      sharedHistory: null,

      setReadOnly: (readOnly, options) => {
        try {
          if (options?.remember !== false)
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
        const { project, history, sync } = get();
        const { ids, recorded } = recordingIds(createId);
        try {
          const out = executeCommand(project, command, args, { ids });
          checkInDev(command.type, out.project);
          set({
            project: out.project,
            history: record(history, {
              type: command.type,
              patches: out.patches,
              inverse: out.inverse,
              at: Date.now(),
              ...(options?.coalesceKey ? { coalesceKey: options.coalesceKey } : {}),
            }),
          });
          if (out.patches.length > 0) {
            sync?.onChange({
              kind: 'command',
              type: command.type,
              args,
              ids: recorded,
              patches: out.patches,
              ...(options?.coalesceKey ? { coalesceKey: options.coalesceKey } : {}),
            });
          }
          return { ok: true, result: out.result };
        } catch (error) {
          if (isDomainError(error)) return { ok: false, error };
          throw error;
        }
      },

      undo: () => {
        if (get().readOnly) return;
        const shared = get().sync?.history;
        if (shared) {
          get().cancelPreview();
          shared.undo();
        } else timeTravel('undo');
      },

      redo: () => {
        if (get().readOnly) return;
        const shared = get().sync?.history;
        if (shared) {
          get().cancelPreview();
          shared.redo();
        } else timeTravel('redo');
      },

      replace: (project) => {
        set({ project, history: EMPTY_HISTORY, transaction: null });
        get().sync?.onChange({ kind: 'replace', project });
      },

      preview: (command, args) => {
        if (get().readOnly) return { ok: false, error: readOnlyError() };
        const transaction = get().transaction;
        const base = transaction?.base ?? get().project;
        const { ids, recorded } = recordingIds(createId);
        try {
          const out = executeCommand(base, command, args, { ids });
          set({
            project: out.project,
            transaction: {
              base,
              op: { type: command.type, args, ids: recorded },
              command,
              patches: out.patches,
              inverse: out.inverse,
            },
          });
          return { ok: true, result: out.result };
        } catch (error) {
          if (!isDomainError(error)) throw error;
          if (!transaction) {
            set({ transaction: { base, op: null, command: null, patches: [], inverse: [] } });
          }
          return { ok: false, error };
        }
      },

      commitPreview: () => {
        const { transaction, history, project, sync } = get();
        if (!transaction) return;
        const op = transaction.op;
        if (op) checkInDev(op.type, project);
        set({
          transaction: null,
          history: op
            ? record(history, {
                type: op.type,
                patches: transaction.patches,
                inverse: transaction.inverse,
                at: Date.now(),
              })
            : history,
        });
        if (op && transaction.patches.length > 0) {
          sync?.onChange({ kind: 'command', ...op, patches: transaction.patches });
        }
      },

      cancelPreview: () => {
        const { transaction } = get();
        if (transaction) set({ project: transaction.base, transaction: null });
      },

      setSync: (sync) => {
        get().cancelPreview();
        set({ sync, sharedHistory: null });
      },

      setSharedHistory: (sharedHistory) => set({ sharedHistory }),

      applyRemote: (command, op) => {
        const { transaction, history } = get();
        const base = transaction?.base ?? get().project;
        try {
          const out = executeCommand(base, command, op.args, { ids: replayIds(op.ids) });
          checkInDev(op.type, out.project);
          set({
            ...(transaction ? rebase(transaction, out.project) : { project: out.project }),
            history: recordEntry(history, {
              type: op.type,
              patches: out.patches,
              inverse: out.inverse,
              at: Date.now(),
              ...(op.coalesceKey ? { coalesceKey: op.coalesceKey } : {}),
            }),
          });
          return { ok: true, result: out.patches };
        } catch (error) {
          if (isDomainError(error)) return { ok: false, error };
          throw error;
        }
      },

      applyHistory: timeTravel,

      syncProject: (project) => {
        const { transaction } = get();
        set(transaction ? rebase(transaction, project) : { project, transaction: null });
      },
    };
  });
}

export type ProjectStore = ReturnType<typeof createProjectStore>;

export const useProjectStore = createProjectStore();

export const useProject = () => useProjectStore((s) => s.project);
export const useCanUndo = () =>
  useProjectStore(
    (s) => !s.readOnly && (s.sharedHistory ? s.sharedHistory.canUndo : s.history.past.length > 0),
  );
export const useCanRedo = () =>
  useProjectStore(
    (s) => !s.readOnly && (s.sharedHistory ? s.sharedHistory.canRedo : s.history.future.length > 0),
  );
export const useReadOnly = () => useProjectStore((s) => s.readOnly);
