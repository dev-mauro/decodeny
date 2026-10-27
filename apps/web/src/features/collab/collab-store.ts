import { create } from 'zustand';
import type { PeerInfo } from './protocol';

/** Invitación del anfitrión a una persona (una por invitado: la conexión es de a dos). */
export interface Invite {
  readonly peerId: string;
  /** Enlace con la oferta (`null` mientras se reúnen los candidatos). */
  readonly link: string | null;
  /** `waiting`: espera la respuesta; `connecting`: se pegó y se está conectando. */
  readonly status: 'preparing' | 'waiting' | 'connecting' | 'failed';
}

/** Invitado uniéndose: prepara su respuesta y espera a que el anfitrión la pegue. */
export interface JoinState {
  readonly hostName: string;
  /** Código de respuesta para enviar al anfitrión (`null` mientras se prepara). */
  readonly answer: string | null;
  readonly status: 'preparing' | 'answer' | 'connected' | 'failed';
}

/** Lo que hace cada participante (cambia poco; la pose en sí no pasa por React). */
export interface PresenceMeta {
  readonly view: '3d' | 'plan';
  readonly levelId: string | null;
  readonly mode: string;
}

interface CollabState {
  readonly role: 'host' | 'guest' | null;
  readonly me: PeerInfo | null;
  /** Los demás participantes conectados. */
  readonly peers: readonly PeerInfo[];
  readonly presence: Readonly<Record<string, PresenceMeta>>;
  readonly invites: readonly Invite[];
  readonly join: JoinState | null;
  readonly dialogOpen: boolean;
  /** Código de invitación con el que se abrió la app (`#join=…`), a la espera del nombre. */
  readonly joinCode: string | null;
  readonly setDialogOpen: (open: boolean) => void;
}

export const useCollabStore = create<CollabState>()((set) => ({
  role: null,
  me: null,
  peers: [],
  presence: {},
  invites: [],
  join: null,
  dialogOpen: false,
  joinCode: null,
  setDialogOpen: (dialogOpen) => set({ dialogOpen }),
}));

export const IDLE_SESSION = {
  role: null,
  me: null,
  peers: [],
  presence: {},
  invites: [],
  join: null,
} satisfies Partial<CollabState>;

export const useInSession = () => useCollabStore((s) => s.role !== null);
