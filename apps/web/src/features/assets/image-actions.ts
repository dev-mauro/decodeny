import { IMAGE_MIME_TYPES, registerAsset, updateItem } from '@decodeny/domain';
import { i18next } from '@/i18n';
import { notify } from '@/state/notifications-store';
import { runCommand } from '@/state/use-command';
import { saveAssetBlob } from './asset-store';

/** Tamaño máximo de una imagen subida (bytes). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/**
 * Pone una imagen del usuario en un parámetro de imagen de un item. Si el item tiene ancho y
 * alto, el alto se ajusta a la proporción de la foto (un cuadro de 60 cm con una foto 3:2 queda
 * de 40 cm). Todo queda como un solo paso de deshacer.
 */
export async function setItemImage(
  levelId: string,
  itemId: string,
  param: string,
  file: File,
  current: { readonly width?: number; readonly frame?: number; readonly mat?: number },
): Promise<void> {
  if (!IMAGE_MIME_TYPES.includes(file.type)) {
    notify('error', i18next.t('assets.unsupported'));
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    notify('error', i18next.t('assets.tooLarge', { mb: MAX_IMAGE_BYTES / 1024 / 1024 }));
    return;
  }
  const size = await imageSize(file);
  if (!size) {
    notify('error', i18next.t('assets.unreadable'));
    return;
  }
  const coalesceKey = `image:${itemId}`;
  const out = runCommand(registerAsset, { mime: file.type }, { coalesceKey });
  if (!out.ok) return;
  await saveAssetBlob(out.result.assetId, file);
  const params: Record<string, string | number> = { [param]: out.result.assetId };
  if (current.width) {
    // La imagen visible es el ancho menos marco y paspartú, a cada lado.
    const border = 2 * ((current.frame ?? 0) + (current.mat ?? 0));
    const visible = Math.max(1, current.width - border);
    params.height = Math.round((visible * size.height) / size.width + border);
  }
  runCommand(updateItem, { levelId, itemId, params }, { coalesceKey });
}
