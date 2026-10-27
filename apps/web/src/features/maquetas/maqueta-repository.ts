import { database, STORES } from '@/shared/lib/db';

/**
 * Maquetas: los proyectos guardados en este navegador (ADR-0012). Que una maqueta esté aquí con
 * un vínculo a la nube (`cloud`) es lo que dice que este navegador es su autor; la nube lo
 * confirma al guardar (sus reglas solo dejan escribir al dueño).
 */

/** Vínculo con la maqueta compartida en la nube. */
export interface CloudLink {
  readonly houseId: string;
  /** Identidad con la que se compartió (la que la nube reconoce como dueña). */
  readonly ownerUid: string;
  /** Revisión de la nube sobre la que está la copia local. */
  readonly rev: number;
  /** Hay cambios locales sin subir. */
  readonly dirty: boolean;
}

export interface MaquetaRecord {
  readonly id: string;
  readonly name: string;
  /** Documento serializado (JSON). */
  readonly project: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Maqueta compartida de la que es copia (fork), si la hay. */
  readonly forkOf: string | null;
  readonly cloud: CloudLink | null;
}

export type MaquetaSummary = Omit<MaquetaRecord, 'project'>;

export interface MaquetaRepository {
  /** Todas, de la editada más recientemente a la más antigua. */
  list(): Promise<MaquetaSummary[]>;
  get(id: string): Promise<MaquetaRecord | undefined>;
  put(record: MaquetaRecord): Promise<void>;
  remove(id: string): Promise<void>;
  /** La maqueta local vinculada a una compartida. */
  findByHouse(houseId: string): Promise<MaquetaRecord | undefined>;
  /** La que estaba abierta al cerrar la app. */
  currentId(): Promise<string | null>;
  setCurrentId(id: string | null): Promise<void>;
}

/** La maqueta sin su documento (para listarla). */
export function toSummary(record: MaquetaRecord): MaquetaSummary {
  const { id, name, createdAt, updatedAt, forkOf, cloud } = record;
  return { id, name, createdAt, updatedAt, forkOf, cloud };
}
const byRecent = (a: MaquetaSummary, b: MaquetaSummary) => b.updatedAt.localeCompare(a.updatedAt);

const CURRENT_KEY = 'currentMaqueta';

/** En IndexedDB (store `maquetas`; la abierta, en `autosave`). */
export const indexedDbMaquetas: MaquetaRepository = {
  async list() {
    const all = (await (await database()).getAll(STORES.maquetas)) as MaquetaRecord[];
    return all.map(toSummary).sort(byRecent);
  },
  async get(id) {
    return (await (await database()).get(STORES.maquetas, id)) as MaquetaRecord | undefined;
  },
  async put(record) {
    await (await database()).put(STORES.maquetas, record, record.id);
  },
  async remove(id) {
    await (await database()).delete(STORES.maquetas, id);
  },
  async findByHouse(houseId) {
    const all = (await (await database()).getAll(STORES.maquetas)) as MaquetaRecord[];
    return all.find((m) => m.cloud?.houseId === houseId);
  },
  async currentId() {
    const value: unknown = await (await database()).get(STORES.autosave, CURRENT_KEY);
    return typeof value === 'string' ? value : null;
  },
  async setCurrentId(id) {
    const db = await database();
    if (id === null) await db.delete(STORES.autosave, CURRENT_KEY);
    else await db.put(STORES.autosave, id, CURRENT_KEY);
  },
};

/** En memoria (tests). */
export function memoryMaquetas(): MaquetaRepository & {
  readonly records: Map<string, MaquetaRecord>;
} {
  const records = new Map<string, MaquetaRecord>();
  let current: string | null = null;
  return {
    records,
    list: () => Promise.resolve([...records.values()].map(toSummary).sort(byRecent)),
    get: (id) => Promise.resolve(records.get(id)),
    put: (record) => {
      records.set(record.id, record);
      return Promise.resolve();
    },
    remove: (id) => {
      records.delete(id);
      return Promise.resolve();
    },
    findByHouse: (houseId) =>
      Promise.resolve([...records.values()].find((m) => m.cloud?.houseId === houseId)),
    currentId: () => Promise.resolve(current),
    setCurrentId: (id) => {
      current = id;
      return Promise.resolve();
    },
  };
}
