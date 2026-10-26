import { DomainError } from '../errors';
import type { Asset, Project } from '../model/types';
import { defineCommand } from './command';

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Tipos de imagen admitidos para assets del usuario. */
export const IMAGE_MIME_TYPES = Object.keys(MIME_EXTENSIONS);

/**
 * Registra una imagen del usuario en el documento. Los bytes no viven en el documento: la
 * aplicación los guarda aparte (IndexedDB) y los empaqueta en el `.zip` al exportar.
 */
export const registerAsset = defineCommand<{ readonly mime: string }, { readonly assetId: string }>(
  'asset.register',
  (draft, args, ctx) => {
    const ext = MIME_EXTENSIONS[args.mime];
    if (!ext) {
      throw new DomainError('invalid-argument', 'Formato de imagen no admitido', {
        mime: args.mime,
      });
    }
    const id = ctx.ids('asset');
    const asset: Asset = { id, kind: 'image', mime: args.mime, path: `assets/${id}.${ext}` };
    draft.assets.push(asset);
    return { assetId: id };
  },
);

/** Ids de assets referenciados por parámetros de items (cuadros…). */
export function referencedAssetIds(project: Project): Set<string> {
  const ids = new Set(project.assets.map((a) => a.id));
  const used = new Set<string>();
  for (const level of project.levels) {
    for (const item of level.items) {
      for (const value of Object.values(item.params)) {
        if (typeof value === 'string' && ids.has(value)) used.add(value);
      }
    }
  }
  return used;
}

/** El proyecto sin los assets que ya nadie usa (para guardar o exportar). */
export function withoutUnusedAssets(project: Project): Project {
  const used = referencedAssetIds(project);
  return used.size === project.assets.length
    ? project
    : { ...project, assets: project.assets.filter((a) => used.has(a.id)) };
}
