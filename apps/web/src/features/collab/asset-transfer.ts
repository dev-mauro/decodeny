import type { AssetMessage } from './protocol';

/** Imagen → mensaje (bytes en base64; viaja fragmentado por el canal del documento). */
export async function assetMessage(id: string, blob: Blob): Promise<AssetMessage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // De a trozos: `String.fromCharCode(...bytes)` desborda la pila con imágenes grandes.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { t: 'asset', id, mime: blob.type, data: btoa(binary) };
}

export function assetBlob(message: AssetMessage): Blob {
  const binary = atob(message.data);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: message.mime });
}
