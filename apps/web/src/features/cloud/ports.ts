/**
 * Puertos de la nube (ADR-0012): lo que la app necesita de un backend de maquetas compartidas,
 * sin saber cuál es. Hoy los implementa Firebase (`firebase/`) y, en los tests, un backend en
 * memoria; las cuentas de usuario serán otra implementación de `Identity`.
 */

/** Quién soy para la nube. Hoy, anónimo por navegador; con cuentas, el mismo uid enlazado. */
export interface CloudIdentity {
  readonly uid: string;
  readonly kind: 'anonymous' | 'account';
}

export interface Identity {
  /** La identidad ya restaurada en este navegador, sin crear una (`null` si no hay). */
  current(): Promise<CloudIdentity | null>;
  /** La identidad actual, creando una anónima si hace falta (al compartir por primera vez). */
  ensure(): Promise<CloudIdentity>;
}

/** Una maqueta compartida tal como está en la nube. */
export interface HouseSnapshot {
  readonly id: string;
  readonly ownerUid: string;
  /** Maqueta de la que es copia (fork), si la hay. */
  readonly forkOf: string | null;
  readonly name: string;
  /** Documento del proyecto serializado (JSON). */
  readonly project: string;
  /** Imágenes y modelos que usa (ids de asset). */
  readonly assets: readonly string[];
  readonly rev: number;
  /** Última visita o guardado (ms desde 1970). */
  readonly lastVisitAt: number;
}

export interface HouseContent {
  readonly name: string;
  readonly project: string;
  readonly projectSchemaVersion: number;
  readonly assets: readonly string[];
}

export type CloudErrorCode =
  /** Otra pestaña o equipo guardó antes: la revisión ya no es la esperada. */
  | 'conflict'
  /** No es del usuario (o perdió su identidad). */
  | 'forbidden'
  /** No existe (nunca existió o venció por inactividad). */
  | 'not-found'
  /** El proyecto no cabe en un documento. */
  | 'too-large'
  /** Sin conexión o el servicio no responde: se puede reintentar. */
  | 'unavailable';

export class CloudError extends Error {
  constructor(
    readonly code: CloudErrorCode,
    cause?: unknown,
  ) {
    super(`cloud:${code}`, { cause });
    this.name = 'CloudError';
  }
}

export interface HouseRepository {
  get(id: string): Promise<HouseSnapshot | null>;
  /** Crea una maqueta compartida del usuario actual (revisión 1). Devuelve su id. */
  create(owner: CloudIdentity, content: HouseContent, forkOf: string | null): Promise<string>;
  /** Guarda una revisión nueva si la de la nube sigue siendo `expectedRev`. Devuelve la nueva. */
  update(
    owner: CloudIdentity,
    id: string,
    expectedRev: number,
    content: HouseContent,
  ): Promise<number>;
  /** Registra una visita (no requiere identidad). */
  recordVisit(id: string): Promise<void>;
}

export interface AssetRepository {
  has(id: string): Promise<boolean>;
  /** Sube un asset inmutable. Si ya existe, no hace nada. */
  put(owner: CloudIdentity, id: string, blob: Blob): Promise<void>;
  get(id: string): Promise<Blob | null>;
}

export interface CloudBackend {
  readonly identity: Identity;
  readonly houses: HouseRepository;
  readonly assets: AssetRepository;
}
