import {
  applyProjectPatches,
  commandByType,
  EMPTY_HISTORY,
  executeCommand,
  isDomainError,
  replayIds,
  type Project,
} from '@decodeny/domain';
import type { CommandOp, ProjectChange, ProjectStore } from '@/state/project-store';
import type { GuestMessage, HostMessage } from './protocol';

export interface GuestEvents {
  /** El anfitrión rechazó una operación propia (p. ej. se editaba algo que otro borró). */
  readonly onRejected?: (code: string) => void;
  /** Se abrió otro proyecto localmente (Nuevo, Abrir): se deja la sesión. */
  readonly onLocalReplace?: () => void;
}

interface Pending {
  readonly opId: string;
  readonly op: CommandOp;
}

/**
 * Lado invitado de la sincronización: optimista. Cada cambio local se ve al instante, queda
 * pendiente y se envía al anfitrión. Lo que difunde el anfitrión se aplica al documento
 * confirmado, y lo visible es ese documento más los pendientes reejecutados (mismos ids). Así
 * siempre converge al orden del anfitrión.
 */
export class GuestSync {
  #confirmed: Project | null = null;
  #pending: Pending[] = [];
  #counter = 0;

  constructor(
    private readonly store: ProjectStore,
    private readonly send: (message: GuestMessage) => void,
    private readonly events: GuestEvents = {},
    /** Prefijo de los ids de operación (el id del invitado: únicos en la sesión). */
    private readonly opPrefix = 'op',
  ) {}

  get pendingCount(): number {
    return this.#pending.length;
  }

  handle(message: HostMessage): void {
    switch (message.t) {
      case 'welcome': {
        this.#confirmed = message.project;
        this.#pending = [];
        const state = this.store.getState();
        state.cancelPreview();
        // Primero la sesión y después el documento: quien guarda localmente ya sabe que el
        // proyecto recibido es del anfitrión y no lo escribe sobre el propio.
        state.setSync({
          onChange: (change) => this.#onLocalChange(change),
          history: {
            undo: () => this.send({ t: 'history', action: 'undo' }),
            redo: () => this.send({ t: 'history', action: 'redo' }),
          },
        });
        this.store.setState({ project: message.project, history: EMPTY_HISTORY });
        state.setSharedHistory(message.history);
        return;
      }
      case 'applied': {
        if (!this.#confirmed) return;
        this.#confirmed = applyProjectPatches(this.#confirmed, message.patches);
        if (message.opId) this.#pending = this.#pending.filter((p) => p.opId !== message.opId);
        this.store.getState().setSharedHistory(message.history);
        this.#rebuild();
        return;
      }
      case 'rejected': {
        this.#pending = this.#pending.filter((p) => p.opId !== message.opId);
        this.events.onRejected?.(message.code);
        this.#rebuild();
        return;
      }
      case 'replace': {
        this.#confirmed = message.project;
        this.#pending = [];
        this.store.getState().setSharedHistory(message.history);
        this.#rebuild();
        return;
      }
      default:
        return;
    }
  }

  /** Deja la sesión: el documento queda como está, con historial propio desde aquí. */
  stop(): void {
    this.store.getState().setSync(null);
    this.#confirmed = null;
    this.#pending = [];
  }

  #onLocalChange(change: ProjectChange): void {
    if (change.kind === 'replace') {
      this.events.onLocalReplace?.();
      return;
    }
    if (change.kind !== 'command') return;
    const { type, args, ids, coalesceKey } = change;
    const op: CommandOp = { type, args, ids, ...(coalesceKey ? { coalesceKey } : {}) };
    const opId = `${this.opPrefix}-${++this.#counter}`;
    this.#pending.push({ opId, op });
    this.send({ t: 'op', opId, op });
  }

  /** Lo visible: lo confirmado más los pendientes que sigan siendo válidos. */
  #rebuild(): void {
    if (!this.#confirmed) return;
    let visible = this.#confirmed;
    this.#pending = this.#pending.filter(({ op }) => {
      const command = commandByType(op.type);
      if (!command) return false;
      try {
        visible = executeCommand(visible, command, op.args, { ids: replayIds(op.ids) }).project;
        return true;
      } catch (error) {
        // Ya no aplica sobre lo confirmado: el anfitrión también lo rechazará.
        if (isDomainError(error)) return false;
        throw error;
      }
    });
    this.store.getState().syncProject(visible);
  }
}
