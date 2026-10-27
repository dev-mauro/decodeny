import { Deframer, frame } from './framing';

/**
 * Conexión WebRTC con otro participante: dos canales de datos negociados de antemano (mismos ids
 * en ambos lados, sin `ondatachannel`), `doc` confiable y ordenado y `presence` sin reintentos.
 * La señalización es manual con ICE no incremental: se espera a tener todos los candidatos y se
 * comparte el SDP completo de una vez.
 */

/** Servidores STUN públicos: descubren la dirección pública para atravesar el NAT. */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** Espera máxima para reunir candidatos: si un STUN no responde, se sigue con lo que haya. */
const GATHER_TIMEOUT_MS = 5000;

export type LinkChannel = 'doc' | 'presence';

export interface PeerLinkEvents {
  readonly onOpen?: () => void;
  /** La conexión se cerró o falló (`failed`: no se pudo conectar o se perdió). */
  readonly onClose?: (reason: 'closed' | 'failed') => void;
  readonly onMessage?: (channel: LinkChannel, message: unknown) => void;
}

function waitForCandidates(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = setTimeout(done, GATHER_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export class PeerLink {
  readonly #pc: RTCPeerConnection;
  readonly #doc: RTCDataChannel;
  readonly #presence: RTCDataChannel;
  readonly #deframer = new Deframer();
  #events: PeerLinkEvents = {};
  #closed = false;

  constructor(iceServers: RTCIceServer[] = ICE_SERVERS) {
    this.#pc = new RTCPeerConnection({ iceServers });
    this.#doc = this.#pc.createDataChannel('doc', { negotiated: true, id: 0, ordered: true });
    this.#presence = this.#pc.createDataChannel('presence', {
      negotiated: true,
      id: 1,
      ordered: false,
      maxRetransmits: 0,
    });
    this.#doc.onopen = () => this.#events.onOpen?.();
    this.#doc.onclose = () => this.#finish('closed');
    this.#doc.onmessage = (event: MessageEvent<string>) => {
      const message = this.#deframer.push(event.data);
      if (message !== null) this.#events.onMessage?.('doc', message);
    };
    this.#presence.onmessage = (event: MessageEvent<string>) => {
      this.#events.onMessage?.('presence', JSON.parse(event.data) as unknown);
    };
    this.#pc.onconnectionstatechange = () => {
      if (this.#pc.connectionState === 'failed') this.#finish('failed');
      if (this.#pc.connectionState === 'closed') this.#finish('closed');
    };
  }

  /** Escucha los eventos (reemplaza los anteriores). */
  listen(events: PeerLinkEvents): void {
    this.#events = events;
  }

  get open(): boolean {
    return this.#doc.readyState === 'open';
  }

  /** Anfitrión: la oferta completa (con candidatos) para la invitación. */
  async createOffer(): Promise<string> {
    await this.#pc.setLocalDescription(await this.#pc.createOffer());
    await waitForCandidates(this.#pc);
    return this.#pc.localDescription?.sdp ?? '';
  }

  /** Invitado: acepta la oferta y devuelve su respuesta completa. */
  async acceptOffer(sdp: string): Promise<string> {
    await this.#pc.setRemoteDescription({ type: 'offer', sdp });
    await this.#pc.setLocalDescription(await this.#pc.createAnswer());
    await waitForCandidates(this.#pc);
    return this.#pc.localDescription?.sdp ?? '';
  }

  /** Anfitrión: aplica la respuesta pegada; la conexión se abre sola. */
  async acceptAnswer(sdp: string): Promise<void> {
    await this.#pc.setRemoteDescription({ type: 'answer', sdp });
  }

  send(message: unknown): void {
    if (!this.open) return;
    for (const part of frame(message)) this.#doc.send(part);
  }

  /** Mensajes que pueden perderse (poses): si el canal está lleno se descartan. */
  sendPresence(message: unknown): void {
    if (this.#presence.readyState !== 'open' || this.#presence.bufferedAmount > 64_000) return;
    this.#presence.send(JSON.stringify(message));
  }

  close(): void {
    this.#finish('closed');
  }

  #finish(reason: 'closed' | 'failed'): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#doc.close();
    this.#presence.close();
    this.#pc.close();
    this.#events.onClose?.(reason);
  }
}
