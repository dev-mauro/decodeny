/**
 * Señalización por salas (ADR-0014): la oferta y la respuesta WebRTC viajan por un buzón en la
 * nube en vez de copiarse a mano. El anfitrión abre una sala con un código corto; cada invitado
 * deja una solicitud con su oferta y el anfitrión le contesta en ella. La sala queda abierta para
 * más invitados hasta que el anfitrión termina la sesión (o vence).
 */

/** Código de sala: 6 caracteres sin ambiguos (sin I, L, O, 0 ni 1). */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
/** Lo mismo que exigen las reglas de Firestore. */
const ROOM_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function randomRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_ALPHABET.charAt(Math.floor(random() * ROOM_ALPHABET.length));
  }
  return code;
}

/** Normaliza lo que escribió la persona (minúsculas, espacios, guiones); `null` si no es válido. */
export function parseRoomCode(text: string): string | null {
  const code = text.toUpperCase().replace(/[\s-]/g, '');
  return ROOM_CODE.test(code) ? code : null;
}

/** Para mostrar: `K7Q-4MD`. */
export const formatRoomCode = (code: string): string => `${code.slice(0, 3)}-${code.slice(3)}`;

/** Una persona que pide entrar, con su oferta (SDP completo). */
export interface RoomRequest {
  readonly id: string;
  readonly name: string;
  readonly offer: string;
}

export interface RoomJoin {
  readonly requestId: string;
  /** La respuesta del anfitrión cuando llegue. */
  readonly answer: Promise<string>;
  /** Deja de esperar y retira la solicitud. */
  cancel(): void;
}

export interface RoomSignaling {
  /** Anfitrión: abre una sala nueva. Devuelve su código. */
  openRoom(hostName: string): Promise<string>;
  /** Anfitrión: avisa de cada solicitud nueva. Devuelve la desuscripción. */
  onRequest(code: string, listener: (request: RoomRequest) => void): () => void;
  answer(code: string, requestId: string, sdp: string): Promise<void>;
  /** Cualquiera de los dos: borra la solicitud (ya conectados, o al cancelar). */
  removeRequest(code: string, requestId: string): Promise<void>;
  closeRoom(code: string): Promise<void>;
  /** Invitado: el anfitrión de la sala, o `null` si no existe o venció. */
  findRoom(code: string): Promise<{ readonly hostName: string } | null>;
  /** Invitado: deja su solicitud con la oferta. */
  request(code: string, name: string, offer: string): Promise<RoomJoin>;
}
