/** Compresión deflate (sin encabezados) con las APIs nativas del navegador (y de Node). */

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export const deflate = (bytes: Uint8Array<ArrayBuffer>) =>
  pipe(bytes, new CompressionStream('deflate-raw'));

export const inflate = (bytes: Uint8Array<ArrayBuffer>) =>
  pipe(bytes, new DecompressionStream('deflate-raw'));

export const deflateText = (text: string) => deflate(new TextEncoder().encode(text));

export async function inflateText(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return new TextDecoder().decode(await inflate(bytes));
}
