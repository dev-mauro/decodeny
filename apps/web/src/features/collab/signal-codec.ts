import { deflate, inflate } from '@/shared/lib/compression';

/**
 * Códec de la señalización manual: la oferta o la respuesta WebRTC (SDP con todos sus
 * candidatos) se comprime y se codifica en base64url para copiarla en un enlace o un mensaje.
 * Formato: `D1.<tipo>.<datos>` (versión 1; `o` = oferta, `a` = respuesta).
 */

export type SignalKind = 'offer' | 'answer';

/** Lo que viaja: la descripción de sesión y, en la oferta, a quién se invita. */
export interface SignalPayload {
  readonly kind: SignalKind;
  readonly sdp: string;
  /** Id asignado al invitado (en la oferta y en su respuesta). */
  readonly peerId: string;
  /** Nombre de quien envía (anfitrión en la oferta, invitado en la respuesta). */
  readonly name: string;
}

const PREFIX = 'D1';
const KIND_CODE: Record<SignalKind, string> = { offer: 'o', answer: 'a' };

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function encodeSignal(payload: SignalPayload): Promise<string> {
  const json = new TextEncoder().encode(
    JSON.stringify({ s: payload.sdp, p: payload.peerId, n: payload.name }),
  );
  const packed = await deflate(json);
  return `${PREFIX}.${KIND_CODE[payload.kind]}.${toBase64Url(packed)}`;
}

/** Decodifica un código pegado (tolera espacios y saltos de línea de los mensajeros). */
export async function decodeSignal(code: string): Promise<SignalPayload> {
  const clean = code.replace(/\s+/g, '');
  const [prefix, kindCode, data] = clean.split('.');
  const kind = (Object.keys(KIND_CODE) as SignalKind[]).find((k) => KIND_CODE[k] === kindCode);
  if (prefix !== PREFIX || !kind || !data) throw new Error('signal-invalid');
  let raw: { s?: unknown; p?: unknown; n?: unknown };
  try {
    const json = await inflate(fromBase64Url(data));
    raw = JSON.parse(new TextDecoder().decode(json)) as typeof raw;
  } catch {
    throw new Error('signal-invalid');
  }
  if (typeof raw.s !== 'string' || typeof raw.p !== 'string' || typeof raw.n !== 'string') {
    throw new Error('signal-invalid');
  }
  return { kind, sdp: raw.s, peerId: raw.p, name: raw.n };
}

/** Enlace de invitación: la app abierta con `#join=<código>` ofrece unirse. */
export function inviteLink(code: string, base: string): string {
  const url = new URL(base);
  url.hash = `join=${code}`;
  return url.toString();
}

/**
 * Extrae un código de un texto pegado. Si el texto es solo el código, se le quitan los espacios
 * (los mensajeros lo parten en líneas); si viene con texto alrededor, se toma esa palabra.
 */
function codeFrom(text: string, kindCode: string): string | null {
  const trimmed = text.trim();
  const source = trimmed.startsWith(`${PREFIX}.${kindCode}.`) ? trimmed.replace(/\s+/g, '') : text;
  const match = new RegExp(`(${PREFIX}\\.${kindCode}\\.[A-Za-z0-9_-]+)`).exec(source);
  return match?.[1] ?? null;
}

/** Código de invitación de un enlace (o el código mismo si se pegó solo). */
export const inviteCodeFrom = (text: string): string | null => codeFrom(text, KIND_CODE.offer);

/** Código de respuesta pegado (tolera texto alrededor). */
export const answerCodeFrom = (text: string): string | null => codeFrom(text, KIND_CODE.answer);
