import {
  CURRENT_SCHEMA_VERSION,
  parseProjectFile,
  serializeProject,
  withoutUnusedAssets,
  type Project,
} from '@decodeny/domain';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { newProject, type ProjectStore } from '@/state/project-store';
import {
  CloudError,
  type CloudBackend,
  type HouseContent,
  type HouseSnapshot,
} from '../cloud/ports';
import {
  toSummary,
  type MaquetaRecord,
  type MaquetaRepository,
  type MaquetaSummary,
} from './maqueta-repository';

/**
 * Sesión de maquetas (ADR-0012): de dónde viene el documento abierto y adónde va cada cambio.
 *
 * - Una **maqueta** se guarda en este navegador con cada cambio. Si está compartida, además se
 *   sube a la nube (agrupando cambios), sobre la revisión que tiene: si otra pestaña guardó antes
 *   (`conflict`) o la nube no reconoce al dueño (`forbidden`), los cambios locales quedan en una
 *   copia nueva y nunca se pisa ni se pierde trabajo.
 * - Un **borrador** (proyecto nuevo) se vuelve maqueta con su primer cambio.
 * - Una **visita** (maqueta compartida de otra persona) se mira tal cual; su primer cambio crea
 *   una maqueta propia que es copia de aquella (fork). El original no cambia.
 * - Como **invitado** de una sesión colaborativa el documento es del anfitrión: no se guarda;
 *   al terminar la sesión, lo recibido queda como maqueta propia.
 */

export type Binding =
  | { readonly kind: 'maqueta'; readonly id: string }
  | { readonly kind: 'draft'; readonly baseline: Project }
  | { readonly kind: 'visit'; readonly houseId: string; readonly baseline: Project }
  | { readonly kind: 'guest' };

export type CloudStatus = 'local' | 'saving' | 'saved' | 'offline' | 'error';

export interface MaquetaState {
  readonly binding: Binding;
  readonly maquetas: readonly MaquetaSummary[];
  /** Estado de la sincronización de la maqueta abierta (`local`: no está compartida). */
  readonly cloud: CloudStatus;
  /** Maqueta compartida de la abierta, si lo está. */
  readonly houseId: string | null;
  /** Revisión de la nube que tiene esta pestaña (sube con cada guardado en la nube). */
  readonly rev: number | null;
}

export type MaquetaNotice =
  /** Se creó una copia propia de la maqueta compartida que se estaba mirando. */
  | { readonly kind: 'forked' }
  /** Otra pestaña guardó antes: los cambios de esta quedaron en una copia. */
  | { readonly kind: 'conflict' }
  /** La nube no reconoce a este navegador como dueño: los cambios siguen en una copia. */
  | { readonly kind: 'not-owner' }
  /** La maqueta compartida ya no existe (venció): queda solo en este navegador. */
  | { readonly kind: 'expired' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'save-failed' };

export interface MaquetaDeps {
  readonly repo: MaquetaRepository;
  readonly store: ProjectStore;
  /** Backend de la nube (se carga bajo demanda); `null`: sin nube. */
  readonly cloud: (() => Promise<CloudBackend>) | null;
  readonly assets: {
    readonly blob: (id: string) => Promise<Blob | undefined>;
    readonly save: (id: string, blob: Blob) => Promise<void>;
  };
  readonly generator: string;
  readonly newId: () => string;
  readonly now?: () => Date;
  readonly notify?: (notice: MaquetaNotice) => void;
  /** Refleja la maqueta compartida abierta en la dirección (`?maqueta=…`). */
  readonly location?: (houseId: string | null) => void;
  /** Se abrió otro documento en el editor (p. ej. para limpiar la selección). */
  readonly onOpen?: (project: Project) => void;
  readonly saveDelayMs?: number;
  readonly pushDelayMs?: number;
}

/** Cada cuánto, como mucho, se registra una visita a una maqueta ajena. */
const VISIT_INTERVAL_MS = 12 * 3600_000;
const RETRY_MS = [5_000, 15_000, 60_000];

export class MaquetaSession {
  readonly state: StoreApi<MaquetaState>;
  readonly #deps: MaquetaDeps;
  readonly #now: () => Date;
  /** Escrituras en serie: guardar, subir y separar copias nunca se pisan entre sí. */
  #queue: Promise<unknown> = Promise.resolve();
  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #pushTimer: ReturnType<typeof setTimeout> | undefined;
  #retry = 0;
  /** Lo último guardado (o abierto) de la maqueta actual: no hace falta volver a guardarlo. */
  #saved: Project | null = null;
  #uploaded = new Set<string>();
  /**
   * Revisión de la nube sobre la que trabaja esta pestaña, por maqueta. Es propia de la pestaña
   * (no la del registro compartido en IndexedDB): así, si otra pestaña del mismo navegador subió
   * una revisión, esta lo detecta como conflicto en vez de pisarla.
   */
  #revs = new Map<string, number>();
  #unsubscribe: (() => void) | null = null;

  constructor(deps: MaquetaDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? (() => new Date());
    this.state = createStore<MaquetaState>()(() => ({
      binding: { kind: 'draft', baseline: deps.store.getState().project },
      maquetas: [],
      cloud: 'local',
      houseId: null,
      rev: null,
    }));
  }

  get cloudEnabled(): boolean {
    return this.#deps.cloud !== null;
  }

  /** Abre lo que corresponde al iniciar: la maqueta compartida del enlace o la última abierta. */
  async start(options: { readonly houseId?: string | null; readonly legacy?: string | null } = {}) {
    await this.#migrateLegacy(options.legacy ?? null);
    await this.refresh();
    const opened = options.houseId ? await this.openShared(options.houseId) : false;
    if (!opened) {
      const id = await this.#deps.repo.currentId();
      const record = id ? await this.#deps.repo.get(id) : undefined;
      if (!record || !this.#openRecord(record)) this.newDraft();
    }
    this.#unsubscribe ??= this.#deps.store.subscribe((state, previous) => {
      if (state.sync !== previous.sync) this.#syncChanged();
      if (state.project !== previous.project) this.#projectChanged(state.project);
    });
    void this.#pushCurrent();
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    clearTimeout(this.#saveTimer);
    clearTimeout(this.#pushTimer);
  }

  /** Espera a que terminen las escrituras pendientes (tests, antes de cerrar). */
  async flush(): Promise<void> {
    this.#commitPending();
    await this.#queue;
  }

  /**
   * Guarda ya el cambio que esperaba su turno (con la maqueta de ahora): se llama antes de
   * cambiar de documento, para que el último cambio nunca vaya a parar a otro lado.
   */
  #commitPending(): void {
    if (this.#saveTimer === undefined) return;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = undefined;
    this.#save();
  }

  async refresh(): Promise<void> {
    try {
      this.state.setState({ maquetas: await this.#deps.repo.list() });
    } catch {
      // Sin IndexedDB: la lista queda vacía; el proyecto abierto sigue en memoria.
    }
  }

  // ── Abrir y crear ─────────────────────────────────────────────────────────────────────────

  /** Proyecto nuevo, sin guardar hasta su primer cambio. */
  newDraft(project?: Project): void {
    this.#commitPending();
    const next = project ?? this.#deps.store.getState().project;
    this.#bind({ kind: 'draft', baseline: next });
    if (project) this.#replace(project);
    void this.#deps.repo.setCurrentId(null).catch(() => undefined);
  }

  /** Guarda un proyecto como maqueta nueva y lo abre (abrir un archivo, una plantilla…). */
  async createFrom(project: Project, forkOf: string | null = null): Promise<string> {
    this.#commitPending();
    const id = this.#deps.newId();
    this.#bind({ kind: 'maqueta', id });
    this.#saved = project;
    if (this.#deps.store.getState().project !== project) this.#replace(project);
    await this.#enqueue(async () => {
      await this.#deps.repo.put(this.#record(id, project, { forkOf, cloud: null }));
      await this.#deps.repo.setCurrentId(id);
    });
    await this.refresh();
    return id;
  }

  async open(id: string): Promise<boolean> {
    await this.flush();
    const record = await this.#deps.repo.get(id);
    return record ? this.#openRecord(record) : false;
  }

  async remove(id: string): Promise<void> {
    await this.flush();
    await this.#enqueue(() => this.#deps.repo.remove(id));
    const binding = this.state.getState().binding;
    if (binding.kind === 'maqueta' && binding.id === id) this.newDraft(newProject());
    await this.refresh();
  }

  /** Abre una maqueta compartida: la propia (si está en este navegador) o como visita. */
  async openShared(houseId: string): Promise<boolean> {
    if (!this.#deps.cloud) return false;
    await this.flush();
    let backend: CloudBackend;
    let house: HouseSnapshot | null;
    try {
      backend = await this.#deps.cloud();
      house = await backend.houses.get(houseId);
    } catch {
      this.#notify({ kind: 'unavailable' });
      return false;
    }
    const local = await this.#deps.repo.findByHouse(houseId);
    if (!house) {
      if (local) await this.#unlink(local.id, 'expired');
      else this.#notify({ kind: 'not-found' });
      return false;
    }
    void this.#download(backend, house.assets);
    if (local?.cloud?.ownerUid === house.ownerUid) {
      // Propia. Si la nube va adelante y aquí no hay cambios sin subir, se trae lo último.
      let record = local;
      if (house.rev > local.cloud.rev && !local.cloud.dirty) {
        record = { ...local, project: house.project, cloud: { ...local.cloud, rev: house.rev } };
        await this.#enqueue(() => this.#deps.repo.put(record));
      }
      return this.#openRecord(record);
    }
    const parsed = parseProjectFile(house.project);
    if (!parsed.ok) {
      this.#notify({ kind: 'invalid' });
      return false;
    }
    this.#bind({ kind: 'visit', houseId, baseline: parsed.project }, houseId);
    this.#replace(parsed.project);
    this.#deps.location?.(houseId);
    if (this.#now().getTime() - house.lastVisitAt > VISIT_INTERVAL_MS) {
      void backend.houses.recordVisit(houseId).catch(() => undefined);
    }
    return true;
  }

  // ── Compartir y sincronizar ───────────────────────────────────────────────────────────────

  /** Comparte la maqueta abierta (la guarda antes si era un borrador o una visita). Su id. */
  async share(): Promise<string> {
    if (!this.#deps.cloud) throw new CloudError('unavailable');
    let binding = this.state.getState().binding;
    if (binding.kind === 'guest') throw new CloudError('forbidden');
    if (binding.kind !== 'maqueta') {
      await this.createFrom(
        this.#deps.store.getState().project,
        binding.kind === 'visit' ? binding.houseId : null,
      );
      binding = this.state.getState().binding;
    }
    if (binding.kind !== 'maqueta') throw new CloudError('forbidden');
    const id = binding.id;
    await this.flush();
    const backend = await this.#deps.cloud();
    this.state.setState({ cloud: 'saving' });
    try {
      const houseId = await this.#enqueue(async () => {
        const record = await this.#deps.repo.get(id);
        if (!record) throw new CloudError('not-found');
        if (record.cloud) return record.cloud.houseId;
        const owner = await backend.identity.ensure();
        const content = await this.#content(backend, owner, record.project);
        const created = await backend.houses.create(owner, content, record.forkOf);
        await this.#deps.repo.put({
          ...record,
          cloud: { houseId: created, ownerUid: owner.uid, rev: 1, dirty: false },
        });
        this.#revs.set(id, 1);
        return created;
      });
      this.state.setState({ cloud: 'saved', houseId, rev: this.#revs.get(id) ?? 1 });
      this.#deps.location?.(houseId);
      await this.refresh();
      return houseId;
    } catch (error) {
      this.state.setState({ cloud: error instanceof CloudError ? 'error' : 'offline' });
      throw error;
    }
  }

  /** Reintenta subir la maqueta abierta (p. ej. al volver la conexión). */
  sync(): Promise<void> {
    return this.#pushCurrent();
  }

  // ── Interno ───────────────────────────────────────────────────────────────────────────────

  #openRecord(record: MaquetaRecord): boolean {
    const parsed = parseProjectFile(record.project);
    if (!parsed.ok) {
      this.#notify({ kind: 'invalid' });
      return false;
    }
    this.#bind({ kind: 'maqueta', id: record.id }, record.cloud?.houseId ?? null);
    this.#saved = parsed.project;
    if (record.cloud) {
      this.#revs.set(record.id, record.cloud.rev);
      this.state.setState({ rev: record.cloud.rev });
    }
    if (record.cloud?.dirty) this.state.setState({ cloud: 'saving' });
    this.#replace(parsed.project);
    this.#deps.location?.(record.cloud?.houseId ?? null);
    void this.#deps.repo.setCurrentId(record.id).catch(() => undefined);
    if (record.cloud?.dirty) this.#schedulePush(0);
    return true;
  }

  #replace(project: Project): void {
    this.#deps.store.getState().replace(project);
    this.#deps.onOpen?.(project);
  }

  #bind(binding: Binding, houseId: string | null = null): void {
    clearTimeout(this.#pushTimer);
    this.#retry = 0;
    this.state.setState({
      binding,
      houseId,
      cloud: houseId && binding.kind === 'maqueta' ? 'saved' : 'local',
      rev: null,
    });
    if (binding.kind !== 'maqueta') this.#saved = null;
  }

  #syncChanged(): void {
    const { sync, project } = this.#deps.store.getState();
    const binding = this.state.getState().binding;
    if (sync?.history) {
      if (binding.kind !== 'guest') {
        void this.flush();
        this.#bind({ kind: 'guest' });
      }
    } else if (binding.kind === 'guest') {
      // Terminó la sesión como invitado: lo recibido queda como maqueta propia.
      void this.createFrom(project);
    }
  }

  #projectChanged(project: Project): void {
    const binding = this.state.getState().binding;
    switch (binding.kind) {
      case 'guest':
        return;
      case 'draft':
        if (project !== binding.baseline) void this.createFrom(project);
        return;
      case 'visit':
        if (project !== binding.baseline) {
          this.#deps.location?.(null);
          void this.createFrom(project, binding.houseId).then(() =>
            this.#notify({ kind: 'forked' }),
          );
        }
        return;
      case 'maqueta':
        if (project === this.#saved) return;
        clearTimeout(this.#saveTimer);
        this.#saveTimer = setTimeout(() => {
          this.#saveTimer = undefined;
          this.#save();
        }, this.#deps.saveDelayMs ?? 600);
    }
  }

  #save(): void {
    const binding = this.state.getState().binding;
    if (binding.kind !== 'maqueta') return;
    const project = this.#deps.store.getState().project;
    this.#saved = project;
    void this.#enqueue(async () => {
      const record = await this.#deps.repo.get(binding.id);
      const cloud = record?.cloud ? { ...record.cloud, dirty: true } : null;
      const next = this.#record(binding.id, project, {
        createdAt: record?.createdAt,
        forkOf: record?.forkOf ?? null,
        cloud,
      });
      await this.#deps.repo.put(next);
      return next;
    })
      .then((next) => {
        this.#touch(next);
        if (!next.cloud) return;
        // Hasta que se suba, la nube no tiene lo último.
        if (this.#stillOn(binding.id) && this.state.getState().cloud !== 'offline') {
          this.state.setState({ cloud: 'saving' });
        }
        this.#schedulePush();
      })
      .catch(() => this.#notify({ kind: 'save-failed' }));
  }

  #schedulePush(delay = this.#deps.pushDelayMs ?? 4000): void {
    clearTimeout(this.#pushTimer);
    this.#pushTimer = setTimeout(() => void this.#pushCurrent(), delay);
  }

  /** Sube la maqueta abierta si está compartida y tiene cambios. */
  async #pushCurrent(): Promise<void> {
    const binding = this.state.getState().binding;
    if (binding.kind !== 'maqueta' || !this.#deps.cloud) return;
    await this.flush();
    const id = binding.id;
    let outcome: 'idle' | 'saved' | 'pending' | CloudError;
    try {
      outcome = await this.#enqueue(() => this.#push(id));
    } catch (error) {
      outcome = error instanceof CloudError ? error : new CloudError('unavailable', error);
    }
    if (
      this.#stillOn(id) &&
      (outcome === 'saved' || (outcome === 'idle' && this.state.getState().houseId))
    ) {
      this.#retry = 0;
      this.state.setState({ cloud: 'saved' });
    }
    if (outcome instanceof CloudError) await this.#onPushError(id, outcome);
  }

  async #push(id: string): Promise<'idle' | 'saved' | 'pending'> {
    const record = await this.#deps.repo.get(id);
    if (!record?.cloud?.dirty) return 'idle';
    if (this.#stillOn(id)) this.state.setState({ cloud: 'saving' });
    const backend = await this.#deps.cloud!();
    const owner = await backend.identity.current();
    if (owner?.uid !== record.cloud.ownerUid) throw new CloudError('forbidden');
    const content = await this.#content(backend, owner, record.project);
    const base = this.#revs.get(id) ?? record.cloud.rev;
    const rev = await backend.houses.update(owner, record.cloud.houseId, base, content);
    this.#revs.set(id, rev);
    if (this.#stillOn(id)) this.state.setState({ rev });
    // Lo que se editó mientras se subía queda pendiente para la próxima.
    const latest = (await this.#deps.repo.get(id)) ?? record;
    const dirty = latest.project !== record.project;
    await this.#deps.repo.put({ ...latest, cloud: { ...record.cloud, rev, dirty } });
    if (dirty) this.#schedulePush();
    return dirty ? 'pending' : 'saved';
  }

  async #onPushError(id: string, error: CloudError): Promise<void> {
    const record = await this.#deps.repo.get(id);
    if (!record?.cloud) return;
    switch (error.code) {
      case 'unavailable': {
        if (this.#stillOn(id)) this.state.setState({ cloud: 'offline' });
        const delay = RETRY_MS[Math.min(this.#retry, RETRY_MS.length - 1)]!;
        this.#retry += 1;
        if (this.#stillOn(id)) this.#schedulePush(delay);
        return;
      }
      case 'too-large':
        if (this.#stillOn(id)) this.state.setState({ cloud: 'error' });
        this.#notify({ kind: 'too-large' });
        return;
      case 'not-found':
        await this.#unlink(id, 'expired');
        return;
      case 'forbidden':
        // Sin la identidad dueña: esta maqueta sigue, pero como copia del original.
        await this.#unlink(id, 'not-owner');
        return;
      case 'conflict':
        await this.#splitConflict(record);
    }
  }

  /** Deja la maqueta solo en este navegador (como copia de la compartida). */
  async #unlink(id: string, reason: 'expired' | 'not-owner'): Promise<void> {
    await this.#enqueue(async () => {
      const record = await this.#deps.repo.get(id);
      if (!record?.cloud) return;
      await this.#deps.repo.put({
        ...record,
        forkOf: reason === 'not-owner' ? record.cloud.houseId : record.forkOf,
        cloud: null,
      });
    });
    if (this.#stillOn(id)) {
      this.state.setState({ cloud: 'local', houseId: null });
      this.#deps.location?.(null);
    }
    await this.refresh();
    this.#notify({ kind: reason });
  }

  /**
   * Otra pestaña subió una revisión nueva: la maqueta compartida trae esa versión y los cambios
   * de aquí pasan a una copia nueva, que queda abierta.
   */
  async #splitConflict(record: MaquetaRecord): Promise<void> {
    const link = record.cloud!;
    const backend = await this.#deps.cloud!();
    const house = await backend.houses.get(link.houseId).catch(() => null);
    const copyId = this.#deps.newId();
    await this.#enqueue(async () => {
      const latest = (await this.#deps.repo.get(record.id)) ?? record;
      const parsed = parseProjectFile(latest.project);
      if (!parsed.ok) return;
      await this.#deps.repo.put(
        this.#record(copyId, parsed.project, { forkOf: link.houseId, cloud: null }),
      );
      if (house) {
        await this.#deps.repo.put({
          ...latest,
          project: house.project,
          cloud: { ...link, rev: house.rev, dirty: false },
        });
        this.#revs.set(record.id, house.rev);
      }
    });
    if (this.#stillOn(record.id)) {
      this.#bind({ kind: 'maqueta', id: copyId });
      this.#saved = this.#deps.store.getState().project;
      this.#deps.location?.(null);
      void this.#deps.repo.setCurrentId(copyId).catch(() => undefined);
    }
    await this.refresh();
    this.#notify({ kind: 'conflict' });
  }

  /** Lo que se sube: el documento y sus imágenes (las que falten en la nube). */
  async #content(
    backend: CloudBackend,
    owner: Awaited<ReturnType<CloudBackend['identity']['ensure']>>,
    text: string,
  ): Promise<HouseContent> {
    const parsed = parseProjectFile(text);
    if (!parsed.ok) throw new CloudError('forbidden');
    const project = withoutUnusedAssets(parsed.project);
    for (const asset of project.assets) {
      if (this.#uploaded.has(asset.id)) continue;
      if (!(await backend.assets.has(asset.id))) {
        const blob = await this.#deps.assets.blob(asset.id);
        if (blob) await backend.assets.put(owner, asset.id, blob);
      }
      this.#uploaded.add(asset.id);
    }
    return {
      name: project.meta.name,
      project: serializeProject(project, { generator: this.#deps.generator }),
      projectSchemaVersion: CURRENT_SCHEMA_VERSION,
      assets: project.assets.map((a) => a.id),
    };
  }

  async #download(backend: CloudBackend, ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      if (await this.#deps.assets.blob(id)) continue;
      const blob = await backend.assets.get(id).catch(() => null);
      if (blob) await this.#deps.assets.save(id, blob);
    }
  }

  #record(
    id: string,
    project: Project,
    extra: { createdAt?: string | undefined; forkOf: string | null; cloud: MaquetaRecord['cloud'] },
  ): MaquetaRecord {
    const now = this.#now().toISOString();
    return {
      id,
      name: project.meta.name,
      project: serializeProject(project, { generator: this.#deps.generator }),
      createdAt: extra.createdAt ?? now,
      updatedAt: now,
      forkOf: extra.forkOf,
      cloud: extra.cloud,
    };
  }

  /** Actualiza la lista sin releerla entera (se guarda con cada cambio). */
  #touch(record: MaquetaRecord): void {
    const others = this.state.getState().maquetas.filter((m) => m.id !== record.id);
    this.state.setState({ maquetas: [toSummary(record), ...others] });
  }

  /** El proyecto que había antes de las maquetas (un único autoguardado) pasa a ser una. */
  async #migrateLegacy(text: string | null): Promise<void> {
    if (text === null) return;
    const parsed = parseProjectFile(text);
    if (!parsed.ok || (await this.#deps.repo.list()).length > 0) return;
    const id = this.#deps.newId();
    await this.#deps.repo.put(this.#record(id, parsed.project, { forkOf: null, cloud: null }));
    await this.#deps.repo.setCurrentId(id);
  }

  #stillOn(id: string): boolean {
    const binding = this.state.getState().binding;
    return binding.kind === 'maqueta' && binding.id === id;
  }

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  #notify(notice: MaquetaNotice): void {
    this.#deps.notify?.(notice);
  }
}
