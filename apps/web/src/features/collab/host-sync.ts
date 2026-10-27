import { commandByType, isDomainError } from '@decodeny/domain';
import type { ProjectChange, ProjectStore, SharedHistory } from '@/state/project-store';
import { HOST_ID, type GuestMessage, type HostMessage, type PeerInfo } from './protocol';

export interface HostLink {
  /** Envía a todos los invitados (salvo `except`). */
  readonly broadcast: (message: HostMessage, except?: string) => void;
  readonly send: (peerId: string, message: HostMessage) => void;
}

/**
 * Lado anfitrión de la sincronización del documento: es la autoridad de orden. Ejecuta las
 * operaciones de los invitados sobre su documento (con los mismos ids), las registra en su
 * historial (que es el de la sesión) y difunde a todos el resultado como parches numerados.
 */
export class HostSync {
  #seq = 0;

  constructor(
    private readonly store: ProjectStore,
    private readonly link: HostLink,
  ) {}

  start(): void {
    this.store.getState().setSync({ onChange: (change) => this.#onLocalChange(change) });
  }

  stop(): void {
    this.store.getState().setSync(null);
  }

  /** Mensaje de bienvenida para un invitado recién conectado (el documento sin vistas previas). */
  welcome(you: PeerInfo, peers: readonly PeerInfo[]): HostMessage {
    const state = this.store.getState();
    return {
      t: 'welcome',
      you,
      seq: this.#seq,
      project: state.transaction?.base ?? state.project,
      history: this.#history(),
      peers,
    };
  }

  /** Mensajes del canal del documento de un invitado (la presencia y los assets van aparte). */
  handle(peerId: string, message: GuestMessage): void {
    if (message.t === 'history') {
      // Deshacer/rehacer de la sesión: el cambio vuelve por `#onLocalChange` y se difunde.
      this.store.getState().applyHistory(message.action);
      return;
    }
    if (message.t !== 'op') return;
    const { opId, op } = message;
    const command = commandByType(op.type);
    let code = 'unknown-command';
    if (command) {
      try {
        const out = this.store.getState().applyRemote(command, op);
        if (out.ok) {
          this.link.broadcast({
            t: 'applied',
            seq: ++this.#seq,
            author: peerId,
            opId,
            patches: out.result,
            history: this.#history(),
          });
          return;
        }
        code = out.error.code;
      } catch (error) {
        // Argumentos malformados: el comando falla fuera del dominio. Se rechaza igual.
        code = isDomainError(error) ? error.code : 'invalid-argument';
      }
    }
    this.link.send(peerId, { t: 'rejected', opId, code });
  }

  #history(): SharedHistory {
    const { history } = this.store.getState();
    return { canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
  }

  #onLocalChange(change: ProjectChange): void {
    if (change.kind === 'replace') {
      this.link.broadcast({
        t: 'replace',
        seq: ++this.#seq,
        project: change.project,
        history: this.#history(),
      });
      return;
    }
    this.link.broadcast({
      t: 'applied',
      seq: ++this.#seq,
      author: HOST_ID,
      patches: change.patches,
      history: this.#history(),
    });
  }
}
