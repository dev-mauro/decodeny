import {
  CloudError,
  type CloudBackend,
  type CloudIdentity,
  type HouseContent,
  type HouseSnapshot,
} from './ports';

/**
 * Nube en memoria con las mismas reglas que Firestore (dueño, revisiones, inmutabilidad de los
 * assets). Sirve para los unit tests y para razonar sobre el contrato sin red.
 */
export class MemoryCloud {
  readonly houses = new Map<string, HouseSnapshot>();
  readonly assets = new Map<string, Blob>();
  /** Simula la caída de la red: toda operación falla con `unavailable`. */
  offline = false;
  #next = 1;
  #now = 0;

  /** Un backend para un navegador (cada uno con su identidad). */
  backend(uid: string | null): MemoryBackend {
    return new MemoryBackend(this, uid);
  }

  /** Avanza el reloj de visitas (ms). */
  tick(ms: number): void {
    this.#now += ms;
  }

  now(): number {
    return this.#now;
  }

  nextId(): string {
    return `house${String(this.#next++)}`;
  }
}

export class MemoryBackend implements CloudBackend {
  readonly #cloud: MemoryCloud;
  #uid: string | null;

  constructor(cloud: MemoryCloud, uid: string | null) {
    this.#cloud = cloud;
    this.#uid = uid;
  }

  /** Simula que el navegador perdió su identidad (datos del sitio borrados a medias). */
  forgetIdentity(uid: string | null = null): void {
    this.#uid = uid;
  }

  #online(): void {
    if (this.#cloud.offline) throw new CloudError('unavailable');
  }

  #anonymous(uid: string): CloudIdentity {
    return { uid, kind: 'anonymous' };
  }

  readonly identity = {
    current: () => Promise.resolve(this.#uid === null ? null : this.#anonymous(this.#uid)),
    ensure: () => {
      this.#online();
      this.#uid ??= `uid${this.#cloud.nextId()}`;
      return Promise.resolve(this.#anonymous(this.#uid));
    },
  };

  readonly houses = {
    get: (id: string) => {
      this.#online();
      return Promise.resolve(this.#cloud.houses.get(id) ?? null);
    },
    create: (owner: CloudIdentity, content: HouseContent, forkOf: string | null) => {
      this.#online();
      const id = this.#cloud.nextId();
      this.#cloud.houses.set(id, {
        id,
        ownerUid: owner.uid,
        forkOf,
        name: content.name,
        project: content.project,
        assets: content.assets,
        rev: 1,
        lastVisitAt: this.#cloud.now(),
      });
      return Promise.resolve(id);
    },
    update: (owner: CloudIdentity, id: string, expectedRev: number, content: HouseContent) => {
      this.#online();
      const house = this.#cloud.houses.get(id);
      if (!house) throw new CloudError('not-found');
      if (house.ownerUid !== owner.uid || owner.uid !== this.#uid)
        throw new CloudError('forbidden');
      if (house.rev !== expectedRev) throw new CloudError('conflict');
      const rev = house.rev + 1;
      this.#cloud.houses.set(id, {
        ...house,
        name: content.name,
        project: content.project,
        assets: content.assets,
        rev,
        lastVisitAt: this.#cloud.now(),
      });
      return Promise.resolve(rev);
    },
    recordVisit: (id: string) => {
      this.#online();
      const house = this.#cloud.houses.get(id);
      if (house) this.#cloud.houses.set(id, { ...house, lastVisitAt: this.#cloud.now() });
      return Promise.resolve();
    },
  };

  readonly assets = {
    has: (id: string) => {
      this.#online();
      return Promise.resolve(this.#cloud.assets.has(id));
    },
    put: (_owner: CloudIdentity, id: string, blob: Blob) => {
      this.#online();
      if (!this.#cloud.assets.has(id)) this.#cloud.assets.set(id, blob);
      return Promise.resolve();
    },
    get: (id: string) => {
      this.#online();
      return Promise.resolve(this.#cloud.assets.get(id) ?? null);
    },
  };
}
