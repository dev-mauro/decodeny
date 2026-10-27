import { addItem, registerAsset, renameProject } from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { createProjectStore, newProject } from '@/state/project-store';
import { MemoryCloud, type MemoryBackend } from '../cloud/memory-backend';
import { memoryMaquetas, type MaquetaRepository } from './maqueta-repository';
import { MaquetaSession, type MaquetaNotice } from './maqueta-session';

/** Un navegador: su base local, su identidad en la nube y su editor. */
function browser(
  cloud: MemoryCloud,
  options: { uid?: string | null; repo?: MaquetaRepository; blobs?: Map<string, Blob> } = {},
) {
  const repo = options.repo ?? memoryMaquetas();
  const backend: MemoryBackend = cloud.backend(options.uid ?? null);
  const store = createProjectStore();
  const blobs = options.blobs ?? new Map<string, Blob>();
  const notices: MaquetaNotice['kind'][] = [];
  const locations: (string | null)[] = [];
  let n = 0;
  const session = new MaquetaSession({
    repo,
    store,
    cloud: () => Promise.resolve(backend),
    assets: {
      blob: (id) => Promise.resolve(blobs.get(id)),
      save: (id, blob) => {
        blobs.set(id, blob);
        return Promise.resolve();
      },
    },
    generator: 'decodeny@test',
    newId: () => `mq${String(++n)}${Math.random().toString(36).slice(2, 6)}`,
    notify: (notice) => notices.push(notice.kind),
    location: (houseId) => locations.push(houseId),
    saveDelayMs: 0,
    pushDelayMs: 0,
  });
  const rename = (name: string) => store.getState().dispatch(renameProject, { name });
  const binding = () => session.state.getState().binding;
  /** Guarda lo pendiente y sube a la nube. */
  const settle = async () => {
    await session.flush();
    await session.sync();
  };
  return { repo, backend, store, blobs, session, notices, locations, rename, binding, settle };
}

const projectName = (cloud: MemoryCloud, houseId: string) =>
  (JSON.parse(cloud.houses.get(houseId)!.project) as { meta: { name: string } }).meta.name;

describe('maquetas locales', () => {
  it('un proyecto nuevo se vuelve maqueta con su primer cambio', async () => {
    const a = browser(new MemoryCloud());
    await a.session.start();
    expect(a.binding().kind).toBe('draft');
    expect(a.session.state.getState().maquetas).toHaveLength(0);

    a.rename('Depto Ñuñoa');
    await a.settle();
    expect(a.binding().kind).toBe('maqueta');
    const [only] = await a.repo.list();
    expect(only?.name).toBe('Depto Ñuñoa');
    expect(await a.repo.currentId()).toBe(only?.id);
  });

  it('al reabrir la app se abre la última maqueta, con sus cambios', async () => {
    const cloud = new MemoryCloud();
    const a = browser(cloud);
    await a.session.start();
    a.rename('Casa 1');
    await a.settle();
    a.rename('Casa 1 bis');
    await a.settle();

    const again = browser(cloud, { repo: a.repo });
    await again.session.start();
    expect(again.store.getState().project.meta.name).toBe('Casa 1 bis');
  });

  it('el guardado único de antes pasa a ser una maqueta', async () => {
    const legacy = { ...newProject(), meta: { ...newProject().meta, name: 'De antes' } };
    const a = browser(new MemoryCloud());
    await a.session.start({ legacy: JSON.stringify(legacy) });
    expect(a.store.getState().project.meta.name).toBe('De antes');
    expect(a.binding().kind).toBe('maqueta');
  });
});

describe('compartir y forks', () => {
  async function sharedByAna() {
    const cloud = new MemoryCloud();
    const ana = browser(cloud);
    await ana.session.start();
    ana.rename('Casa de Ana');
    await ana.settle();
    const houseId = await ana.session.share();
    return { cloud, ana, houseId };
  }

  it('compartir sube la maqueta y los cambios del dueño se sincronizan', async () => {
    const { cloud, ana, houseId } = await sharedByAna();
    expect(ana.locations.at(-1)).toBe(houseId);
    expect(cloud.houses.get(houseId)?.rev).toBe(1);

    ana.rename('Casa de Ana v2');
    await ana.settle();
    expect(cloud.houses.get(houseId)?.rev).toBe(2);
    expect(projectName(cloud, houseId)).toBe('Casa de Ana v2');
    expect(ana.session.state.getState().cloud).toBe('saved');
  });

  it('quien abre el enlace la ve tal cual; su primer cambio crea una copia y el original no cambia', async () => {
    const { cloud, houseId } = await sharedByAna();
    const beto = browser(cloud);
    await beto.session.start({ houseId });
    expect(beto.binding()).toMatchObject({ kind: 'visit', houseId });
    expect(beto.store.getState().project.meta.name).toBe('Casa de Ana');
    expect(beto.session.state.getState().maquetas).toHaveLength(0);

    beto.rename('Mi versión');
    await beto.settle();
    expect(beto.binding().kind).toBe('maqueta');
    expect(beto.notices).toContain('forked');
    expect(beto.locations.at(-1)).toBeNull();
    const [fork] = await beto.repo.list();
    expect(fork).toMatchObject({ forkOf: houseId, cloud: null, name: 'Mi versión' });
    expect(projectName(cloud, houseId)).toBe('Casa de Ana');

    // Al compartir la copia, queda vinculada al original.
    const forkId = await beto.session.share();
    expect(forkId).not.toBe(houseId);
    expect(cloud.houses.get(forkId)?.forkOf).toBe(houseId);
  });

  it('el dueño que abre su propio enlace edita el original (no hace fork)', async () => {
    const { cloud, ana, houseId } = await sharedByAna();
    const uid = (await ana.backend.identity.current())!.uid;
    const anaAgain = browser(cloud, { repo: ana.repo, uid });
    await anaAgain.session.start({ houseId });
    expect(anaAgain.binding().kind).toBe('maqueta');
    anaAgain.rename('Retoque');
    await anaAgain.settle();
    expect(projectName(cloud, houseId)).toBe('Retoque');
    expect(anaAgain.notices).not.toContain('forked');
  });

  it('una visita trae las imágenes y las del dueño suben al compartir', async () => {
    const cloud = new MemoryCloud();
    const ana = browser(cloud);
    await ana.session.start();
    const levelId = ana.store.getState().project.levels[0]!.id;
    const registered = ana.store.getState().dispatch(registerAsset, { mime: 'image/png' });
    if (!registered.ok) throw registered.error;
    const assetId = registered.result.assetId;
    ana.blobs.set(assetId, new Blob(['png'], { type: 'image/png' }));
    ana.store.getState().dispatch(addItem, {
      levelId,
      def: 'decor.picture@1',
      params: { image: assetId },
      position: { x: 0, y: 0, z: 1500 },
    });
    await ana.settle();
    const houseId = await ana.session.share();
    expect(cloud.assets.has(assetId)).toBe(true);
    expect(cloud.houses.get(houseId)?.assets).toEqual([assetId]);

    const beto = browser(cloud);
    await beto.session.start({ houseId });
    await new Promise((r) => setTimeout(r, 0));
    expect(beto.blobs.has(assetId)).toBe(true);
  });
});

describe('a prueba de fallos', () => {
  async function shared() {
    const cloud = new MemoryCloud();
    const a = browser(cloud);
    await a.session.start();
    a.rename('Original');
    await a.settle();
    const houseId = await a.session.share();
    return { cloud, a, houseId };
  }

  it('si otra pestaña subió antes, los cambios de esta quedan en una copia', async () => {
    const { cloud, a, houseId } = await shared();
    const uid = (await a.backend.identity.current())!.uid;
    // Segunda pestaña del mismo navegador: misma base local y misma identidad.
    const tab = browser(cloud, { repo: a.repo, uid });
    await tab.session.start({ houseId });
    tab.rename('Desde la otra pestaña');
    await tab.settle();
    expect(cloud.houses.get(houseId)?.rev).toBe(2);

    a.rename('Desde esta pestaña');
    await a.settle();
    expect(a.notices).toContain('conflict');
    // El original conserva lo que subió la otra pestaña; lo de esta, en una copia abierta.
    expect(projectName(cloud, houseId)).toBe('Desde la otra pestaña');
    const original = await a.repo.findByHouse(houseId);
    expect(original?.cloud?.dirty).toBe(false);
    const binding = a.binding();
    expect(binding.kind === 'maqueta' && binding.id !== original?.id).toBe(true);
    const copy = binding.kind === 'maqueta' ? await a.repo.get(binding.id) : undefined;
    expect(copy).toMatchObject({ forkOf: houseId, cloud: null, name: 'Desde esta pestaña' });
  });

  it('si la nube no reconoce al dueño, la maqueta sigue como copia y nada se pierde', async () => {
    const { cloud, a, houseId } = await shared();
    a.backend.forgetIdentity();
    a.rename('Sin identidad');
    await a.settle();
    expect(a.notices).toContain('not-owner');
    expect(projectName(cloud, houseId)).toBe('Original');
    const binding = a.binding();
    const record = binding.kind === 'maqueta' ? await a.repo.get(binding.id) : undefined;
    expect(record).toMatchObject({ cloud: null, forkOf: houseId, name: 'Sin identidad' });
  });

  it('sin conexión se guarda local y se sube al volver', async () => {
    const { cloud, a, houseId } = await shared();
    cloud.offline = true;
    a.rename('Sin red');
    await a.settle();
    expect(a.session.state.getState().cloud).toBe('offline');
    expect((await a.repo.findByHouse(houseId))?.cloud?.dirty).toBe(true);

    cloud.offline = false;
    await a.session.sync();
    expect(projectName(cloud, houseId)).toBe('Sin red');
    expect(a.session.state.getState().cloud).toBe('saved');
  });

  it('si la compartida venció, queda solo en este navegador', async () => {
    const { cloud, a, houseId } = await shared();
    cloud.houses.delete(houseId);
    a.rename('Tarde');
    await a.settle();
    expect(a.notices).toContain('expired');
    expect((await a.repo.list())[0]?.cloud).toBeNull();
  });

  it('un enlace que no existe avisa y abre lo último', async () => {
    const b = browser(new MemoryCloud());
    await b.session.start({ houseId: 'nope' });
    expect(b.notices).toContain('not-found');
    expect(b.binding().kind).toBe('draft');
  });
});

describe('colaboración', () => {
  it('como invitado no se guarda; al terminar, lo recibido queda como maqueta propia', async () => {
    const g = browser(new MemoryCloud());
    await g.session.start();
    g.rename('Mía');
    await g.settle();
    const mine = (await g.repo.list())[0]!;

    g.store.getState().setSync({
      onChange: () => undefined,
      history: { undo: () => undefined, redo: () => undefined },
    });
    g.store.setState({
      project: { ...newProject(), meta: { ...newProject().meta, name: 'Del anfitrión' } },
    });
    await g.settle();
    expect(g.binding().kind).toBe('guest');
    expect((await g.repo.get(mine.id))?.name).toBe('Mía');

    g.store.getState().setSync(null);
    await g.settle();
    const names = (await g.repo.list()).map((m) => m.name).sort();
    expect(names).toEqual(['Del anfitrión', 'Mía']);
  });
});
