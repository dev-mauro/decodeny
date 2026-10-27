// Limpieza programada (scripts/cloud/cleanup.mjs) contra el emulador: `pnpm test:cloud`.
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup } from '../../scripts/cloud/cleanup.mjs';

const app = initializeApp({ projectId: 'demo-decodeny' }, 'cleanup-test');
const db = getFirestore(app);
const DAY = 86_400_000;
const NOW = Date.now();
const quiet = () => undefined;

afterAll(() => deleteApp(app));

async function clear() {
  for (const name of ['houses', 'assets']) {
    for (const ref of await db.collection(name).listDocuments()) await db.recursiveDelete(ref);
  }
}

async function house(id, daysAgo, assets = []) {
  await db.doc(`houses/${id}`).set({
    ownerUid: 'ana',
    assets,
    lastVisitAt: Timestamp.fromMillis(NOW - daysAgo * DAY),
  });
}

async function asset(id, daysAgo, { complete = true } = {}) {
  await db.doc(`assets/${id}/chunks/0`).set({ ownerUid: 'ana', data: Buffer.from('x') });
  if (complete) {
    await db.doc(`assets/${id}`).set({ createdAt: Timestamp.fromMillis(NOW - daysAgo * DAY) });
  }
}

describe('cleanup', () => {
  beforeEach(clear);

  it('borra las maquetas sin visitas en 30 días y conserva las recientes', async () => {
    await house('vieja', 31);
    await house('reciente', 2);
    const result = await cleanup(db, { now: NOW, log: quiet });
    expect(result.houses).toBe(1);
    expect((await db.doc('houses/vieja').get()).exists).toBe(false);
    expect((await db.doc('houses/reciente').get()).exists).toBe(true);
  });

  it('borra los assets que ya nadie usa (con sus trozos), salvo los recién subidos', async () => {
    await house('vieja', 40, ['solo-de-la-vieja', 'compartido']);
    await house('reciente', 1, ['compartido']);
    await asset('solo-de-la-vieja', 40);
    await asset('compartido', 40);
    // Subido «hoy» respecto del momento de la limpieza (dos días después).
    await asset('recien-subido', -2);
    await asset('a-medias', 0, { complete: false });
    const result = await cleanup(db, { now: NOW + 2 * DAY, log: quiet });
    expect(result.assets).toBe(2);
    expect((await db.doc('assets/compartido').get()).exists).toBe(true);
    expect((await db.doc('assets/recien-subido').get()).exists).toBe(true);
    expect((await db.collection('assets/a-medias/chunks').get()).empty).toBe(true);
    expect((await db.collection('assets/solo-de-la-vieja/chunks').get()).empty).toBe(true);
  });

  it('en simulación no borra nada', async () => {
    await house('vieja', 31);
    await asset('suelto', 10);
    const result = await cleanup(db, { now: NOW, dryRun: true, log: quiet });
    expect(result).toEqual({ houses: 1, assets: 1 });
    expect((await db.doc('houses/vieja').get()).exists).toBe(true);
    expect((await db.doc('assets/suelto').get()).exists).toBe(true);
  });
});
