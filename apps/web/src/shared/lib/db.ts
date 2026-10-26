import { openDB, type IDBPDatabase } from 'idb';

/**
 * Base local del navegador: `autosave` (el proyecto en curso) y `assets` (imágenes del usuario,
 * que no viajan dentro del JSON del documento).
 */
const DB_NAME = 'decodeny';
const DB_VERSION = 2;

export const STORES = { autosave: 'autosave', assets: 'assets' } as const;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function database(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // v1 → v2 agrega `assets`; cada store se crea solo si falta.
      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    },
  });
  return dbPromise;
}
