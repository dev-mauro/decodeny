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

/**
 * Invitado uniéndose. A mano (`manual`): prepara su respuesta y espera a que el anfitrión la
 * pegue. Por sala (`room`): deja su oferta en la sala y espera la respuesta (`waiting`).
 */
export interface JoinState {
  readonly via: 'manual' | 'room';
  readonly hostName: string;
  /** Código de respuesta para enviar al anfitrión (`null` mientras se prepara; por sala, nunca). */
  readonly answer: string | null;
  readonly status: 'preparing' | 'answer' | 'waiting' | 'connected' | 'failed';
}

/** Sala con código del anfitrión (ADR-0014): queda abierta para todos los que se unan. */
export interface RoomState {
  readonly code: string | null;
  readonly status: 'opening' | 'open' | 'failed';
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
  readonly room: RoomState | null;
  readonly dialogOpen: boolean;
  /** Código de invitación con el que se abrió la app (`#join=…`), a la espera del nombre. */
  readonly joinCode: string | null;
  /** Código de sala con el que se abrió la app (`?sala=…`). */
  readonly roomCode: string | null;
  /** Conexión a mano (copiar y pegar), en vez de una sala con código. */
  readonly manual: boolean;
  readonly setDialogOpen: (open: boolean) => void;
  readonly setManual: (manual: boolean) => void;
}

export const useCollabStore = create<CollabState>()((set) => ({
  role: null,
  me: null,
  peers: [],
  presence: {},
  invites: [],
  join: null,
  room: null,
  dialogOpen: false,
  joinCode: null,
  roomCode: null,
  manual: false,
  setDialogOpen: (dialogOpen) => set({ dialogOpen }),
  setManual: (manual) => set({ manual }),
}));

export const IDLE_SESSION = {
  role: null,
  me: null,
  peers: [],
  presence: {},
  invites: [],
  join: null,
  room: null,
} satisfies Partial<CollabState>;

export const useInSession = () => useCollabStore((s) => s.role !== null);
