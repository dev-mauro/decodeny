/**
 * Mensajes de la sesión sobre un canal de datos: JSON, y los grandes (el proyecto al unirse,
 * imágenes) partidos en trozos para no depender del tamaño máximo de mensaje de cada navegador.
 */

/** Tamaño máximo de cada trozo (caracteres). 16 kB es seguro en todos los navegadores. */
export const CHUNK_SIZE = 16_000;

interface Chunk {
  readonly t: 'chunk';
  readonly id: string;
  readonly i: number;
  readonly n: number;
  readonly d: string;
}

let chunkCounter = 0;

/** Serializa un mensaje y lo parte si hace falta: lo que se envía, en orden. */
export function frame(message: unknown, size = CHUNK_SIZE): string[] {
  const text = JSON.stringify(message);
  if (text.length <= size) return [text];
  const id = `${Date.now().toString(36)}-${(chunkCounter++).toString(36)}`;
  const n = Math.ceil(text.length / size);
  return Array.from({ length: n }, (_, i) => {
    const chunk: Chunk = { t: 'chunk', id, i, n, d: text.slice(i * size, (i + 1) * size) };
    return JSON.stringify(chunk);
  });
}

/** Reúne los trozos recibidos; devuelve el mensaje cuando está completo (o `null`). */
export class Deframer {
  readonly #partial = new Map<string, (string | undefined)[]>();

  push(text: string): unknown {
    const message = JSON.parse(text) as unknown;
    if (!isChunk(message)) return message;
    const parts = this.#partial.get(message.id) ?? new Array<string | undefined>(message.n);
    parts[message.i] = message.d;
    this.#partial.set(message.id, parts);
    if (parts.filter((p) => p !== undefined).length < message.n) return null;
    this.#partial.delete(message.id);
    return JSON.parse(parts.join('')) as unknown;
  }
}

function isChunk(value: unknown): value is Chunk {
  return typeof value === 'object' && value !== null && (value as { t?: unknown }).t === 'chunk';
}
