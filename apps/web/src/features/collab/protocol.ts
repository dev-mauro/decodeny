import type { Patch, Project } from '@decodeny/domain';
import type { CommandOp, SharedHistory } from '@/state/project-store';

/**
 * Mensajes de una sesión colaborativa (topología en estrella: cada invitado habla solo con el
 * anfitrión, que ordena las operaciones y las difunde). Viajan como JSON por el canal `doc`
 * (confiable y ordenado) salvo `pose`, que va por `presence` (sin reintentos).
 */

/** Id del anfitrión dentro de la sesión (los invitados reciben uno al ser invitados). */
export const HOST_ID = 'host';

export interface PeerInfo {
  readonly id: string;
  readonly name: string;
  /** Color del cuerpo y de la etiqueta (`#rrggbb`). */
  readonly color: string;
}

/** Posición de la cámara de un participante (metros, coordenadas de Three). */
export interface PeerPose {
  readonly id: string;
  readonly position: readonly [number, number, number];
  /** Hacia dónde mira: giro horizontal y vertical (radianes). */
  readonly yaw: number;
  readonly pitch: number;
  /** Modo de navegación (`orbit`, `walk`, `fly`…): en el recorrido el cuerpo va de pie. */
  readonly mode: string;
  /** En el plano no se le dibuja cuerpo. */
  readonly view: '3d' | 'plan';
  readonly levelId: string | null;
}

/** Imagen del usuario (bytes en base64). */
export interface AssetMessage {
  readonly t: 'asset';
  readonly id: string;
  readonly mime: string;
  readonly data: string;
}

export interface PoseMessage {
  readonly t: 'pose';
  readonly pose: PeerPose;
}

export type GuestMessage =
  | { readonly t: 'op'; readonly opId: string; readonly op: CommandOp }
  | { readonly t: 'history'; readonly action: 'undo' | 'redo' }
  | AssetMessage
  | PoseMessage;

export type HostMessage =
  | {
      readonly t: 'welcome';
      readonly you: PeerInfo;
      readonly seq: number;
      readonly project: Project;
      readonly history: SharedHistory;
      readonly peers: readonly PeerInfo[];
    }
  | {
      readonly t: 'applied';
      readonly seq: number;
      readonly author: string;
      readonly opId?: string;
      readonly patches: readonly Patch[];
      readonly history: SharedHistory;
    }
  | { readonly t: 'rejected'; readonly opId: string; readonly code: string }
  | {
      readonly t: 'replace';
      readonly seq: number;
      readonly project: Project;
      readonly history: SharedHistory;
    }
  | { readonly t: 'peers'; readonly peers: readonly PeerInfo[] }
  | { readonly t: 'end' }
  | AssetMessage
  | PoseMessage;

const GUEST_TYPES = new Set(['op', 'history', 'asset', 'pose']);
const HOST_TYPES = new Set([
  'welcome',
  'applied',
  'rejected',
  'replace',
  'peers',
  'end',
  'asset',
  'pose',
]);

const typeOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? (value as { t?: unknown }).t : undefined;

/**
 * Validación superficial de lo que llega de la red: el tipo de mensaje. El contenido de una
 * operación lo valida el comando del dominio al ejecutarse (y si falla, se rechaza).
 */
export function isGuestMessage(value: unknown): value is GuestMessage {
  const t = typeOf(value);
  return typeof t === 'string' && GUEST_TYPES.has(t);
}

export function isHostMessage(value: unknown): value is HostMessage {
  const t = typeOf(value);
  return typeof t === 'string' && HOST_TYPES.has(t);
}

/** Colores de los participantes, en orden de llegada (el anfitrión usa el primero). */
export const PEER_COLORS = [
  '#2563eb',
  '#db2777',
  '#16a34a',
  '#ea580c',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#dc2626',
] as const;
