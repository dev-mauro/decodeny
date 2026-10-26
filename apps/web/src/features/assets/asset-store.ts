import { create } from 'zustand';
import { database, STORES } from '@/shared/lib/db';

/**
 * Bytes de las imágenes del usuario. El documento solo lista los assets (`project.assets`);
 * los blobs viven en IndexedDB y en memoria, y se exponen como object URLs para el visor.
 */
interface AssetState {
  readonly urls: Readonly<Record<string, string>>;
}

export const useAssetStore = create<AssetState>()(() => ({ urls: {} }));

const blobs = new Map<string, Blob>();

function expose(id: string, blob: Blob): void {
  blobs.set(id, blob);
  const previous = useAssetStore.getState().urls[id];
  if (previous) URL.revokeObjectURL(previous);
  useAssetStore.setState((s) => ({ urls: { ...s.urls, [id]: URL.createObjectURL(blob) } }));
}

/** Guarda una imagen (en memoria y en IndexedDB) bajo el id de su asset. */
export async function saveAssetBlob(id: string, blob: Blob): Promise<void> {
  expose(id, blob);
  try {
    await (await database()).put(STORES.assets, blob, id);
  } catch {
    // Sin IndexedDB la imagen sigue disponible en esta sesión y en el archivo exportado.
  }
}

/** Carga desde IndexedDB las imágenes que aún no están en memoria. */
export async function ensureAssets(ids: readonly string[]): Promise<void> {
  const missing = ids.filter((id) => !blobs.has(id));
  if (missing.length === 0) return;
  try {
    const db = await database();
    for (const id of missing) {
      const blob: unknown = await db.get(STORES.assets, id);
      if (blob instanceof Blob) expose(id, blob);
    }
  } catch {
    // Imágenes no disponibles: el cuadro se muestra con un lienzo neutro.
  }
}

export const assetBlob = (id: string): Blob | undefined => blobs.get(id);

export const assetUrl = (id: string): string | undefined => useAssetStore.getState().urls[id];
