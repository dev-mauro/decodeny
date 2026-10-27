import { createId } from '@decodeny/domain';
import { useStore } from 'zustand';
import { GENERATOR } from '@/config';
import { assetBlob, ensureAssets, saveAssetBlob } from '@/features/assets/asset-store';
import { i18next } from '@/i18n';
import { database, STORES } from '@/shared/lib/db';
import { notify } from '@/state/notifications-store';
import { useProjectStore } from '@/state/project-store';
import { useUiStore } from '@/state/ui-store';
import { readCloudConfig } from '../cloud/cloud-config';
import type { CloudBackend } from '../cloud/ports';
import { indexedDbMaquetas } from './maqueta-repository';
import { MaquetaSession, type MaquetaNotice, type MaquetaState } from './maqueta-session';

/** Parámetro de la dirección con la maqueta compartida: `…/?maqueta=<id>`. */
export const SHARE_PARAM = 'maqueta';

const config = readCloudConfig();
let backend: Promise<CloudBackend> | null = null;

/** El backend de Firebase pesa: se descarga recién al compartir o al abrir un enlace. */
function loadBackend(): Promise<CloudBackend> {
  backend ??= import('../cloud/firebase/firebase-backend').then((m) =>
    m.createFirebaseBackend(config!),
  );
  return backend;
}

const NOTICES = {
  forked: ['info', 'maquetas.forked'],
  conflict: ['info', 'maquetas.conflict'],
  'not-owner': ['info', 'maquetas.notOwner'],
  expired: ['info', 'maquetas.expired'],
  'not-found': ['error', 'maquetas.notFound'],
  'too-large': ['error', 'maquetas.tooLarge'],
  invalid: ['error', 'maquetas.invalid'],
  unavailable: ['error', 'maquetas.unavailable'],
  'save-failed': ['error', 'io.autosaveFailed'],
} as const satisfies Record<MaquetaNotice['kind'], readonly ['success' | 'info' | 'error', string]>;

/** La sesión de maquetas de la app (IndexedDB + nube si está configurada). */
export const maquetas = new MaquetaSession({
  repo: indexedDbMaquetas,
  store: useProjectStore,
  cloud: config ? loadBackend : null,
  assets: {
    blob: async (id) => {
      await ensureAssets([id]);
      return assetBlob(id);
    },
    save: (id, blob) => saveAssetBlob(id, blob, { remote: true }),
  },
  generator: GENERATOR,
  newId: () => createId('proj').replace(/^proj_/, 'mq_'),
  notify: (notice) => {
    const [level, key] = NOTICES[notice.kind];
    notify(level, i18next.t(key));
  },
  location: (houseId) => {
    const url = new URL(window.location.href);
    if (houseId) url.searchParams.set(SHARE_PARAM, houseId);
    else url.searchParams.delete(SHARE_PARAM);
    if (url.href !== window.location.href) window.history.replaceState(null, '', url);
  },
  onOpen: (project) => {
    useUiStore.setState({
      selection: null,
      selectionGroup: [],
      levelId: project.levels[0]?.id ?? null,
    });
    void ensureAssets(project.assets.map((a) => a.id));
  },
});

export const useMaquetas = <T>(selector: (state: MaquetaState) => T): T =>
  useStore(maquetas.state, selector);

/** Maqueta compartida que pide la dirección, si la hay. */
export function sharedFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get(SHARE_PARAM);
}

/** El único proyecto que se autoguardaba antes de las maquetas (se migra a una, una vez). */
const LEGACY_KEY = 'current';

async function legacyAutosave(action: 'read' | 'delete'): Promise<string | null> {
  try {
    const db = await database();
    if (action === 'delete') {
      await db.delete(STORES.autosave, LEGACY_KEY);
      return null;
    }
    const value: unknown = await db.get(STORES.autosave, LEGACY_KEY);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Arranque: abre la maqueta del enlace o la última, y reintenta subir al volver la conexión. */
export async function startMaquetas(): Promise<void> {
  const legacy = await legacyAutosave('read');
  await maquetas.start({ houseId: sharedFromUrl(), legacy });
  // Ya migrado (o descartado si estaba dañado): no se vuelve a leer.
  if (legacy !== null) await legacyAutosave('delete');
  window.addEventListener('online', () => void maquetas.sync());
  // Al cerrar o recargar, el último cambio no espera su turno.
  window.addEventListener('pagehide', () => void maquetas.flush());
}

export const shareUrl = (houseId: string): string => {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set(SHARE_PARAM, houseId);
  return url.href;
};
