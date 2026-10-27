// Reglas de seguridad de Firestore (ADR-0012) contra el emulador: `pnpm test:cloud`.
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Bytes,
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8181').split(':');

let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-decodeny',
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync(join(import.meta.dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const ana = () => env.authenticatedContext('ana').firestore();
const beto = () => env.authenticatedContext('beto').firestore();
const anon = () => env.unauthenticatedContext().firestore();

function house(ownerUid, overrides = {}) {
  return {
    v: 1,
    ownerUid,
    forkOf: null,
    name: 'Depto',
    project: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])),
    projectSchemaVersion: 1,
    assets: [],
    rev: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastVisitAt: serverTimestamp(),
    ...overrides,
  };
}

/** Maqueta de Ana ya guardada, con la última visita hace `visitedAgoMs`. */
async function seedHouse(id = 'h1', visitedAgoMs = 2 * 3600_000) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const old = Timestamp.fromMillis(Date.now() - visitedAgoMs);
    await setDoc(doc(ctx.firestore(), 'houses', id), {
      ...house('ana'),
      createdAt: old,
      updatedAt: old,
      lastVisitAt: old,
    });
  });
}

function edit(overrides = {}) {
  return {
    name: 'Depto nuevo',
    project: Bytes.fromUint8Array(new Uint8Array([4, 5])),
    rev: 2,
    updatedAt: serverTimestamp(),
    lastVisitAt: serverTimestamp(),
    ...overrides,
  };
}

describe('houses', () => {
  it('se crea solo con identidad propia, rev 1 y campos válidos', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'houses', 'h1'), house('ana')));
    await assertFails(setDoc(doc(anon(), 'houses', 'h2'), house('ana')));
    await assertFails(setDoc(doc(beto(), 'houses', 'h3'), house('ana')));
    await assertFails(setDoc(doc(ana(), 'houses', 'h4'), house('ana', { rev: 5 })));
    await assertFails(setDoc(doc(ana(), 'houses', 'h5'), house('ana', { extra: true })));
    await assertFails(setDoc(doc(ana(), 'houses', 'h6'), house('ana', { project: 'texto plano' })));
  });

  it('cualquiera la lee por id, pero nadie lista las ajenas', async () => {
    await seedHouse();
    await assertSucceeds(getDoc(doc(anon(), 'houses', 'h1')));
    await assertFails(getDocs(collection(anon(), 'houses')));
    await assertFails(getDocs(query(collection(beto(), 'houses'), where('ownerUid', '==', 'ana'))));
    await assertSucceeds(
      getDocs(query(collection(ana(), 'houses'), where('ownerUid', '==', 'ana'))),
    );
  });

  it('solo el dueño la edita, con la revisión siguiente', async () => {
    await seedHouse();
    await assertSucceeds(updateDoc(doc(ana(), 'houses', 'h1'), edit()));
    // Revisión vieja (otra pestaña guardó antes): rechazada.
    await assertFails(updateDoc(doc(ana(), 'houses', 'h1'), edit({ rev: 2 })));
    await assertFails(updateDoc(doc(beto(), 'houses', 'h1'), edit({ rev: 3 })));
    // No puede cambiar de dueño ni de origen.
    await assertFails(updateDoc(doc(ana(), 'houses', 'h1'), edit({ rev: 3, ownerUid: 'beto' })));
    await assertFails(updateDoc(doc(ana(), 'houses', 'h1'), edit({ rev: 3, forkOf: 'otra' })));
  });

  it('una visita sin cuenta solo toca lastVisitAt, como mucho una por hora', async () => {
    await seedHouse('h1');
    await assertSucceeds(
      updateDoc(doc(anon(), 'houses', 'h1'), { lastVisitAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(doc(anon(), 'houses', 'h1'), { lastVisitAt: serverTimestamp() }));
    await seedHouse('h2');
    await assertFails(
      updateDoc(doc(anon(), 'houses', 'h2'), { lastVisitAt: serverTimestamp(), name: 'X' }),
    );
  });

  it('nadie la borra desde el navegador', async () => {
    await seedHouse();
    await assertFails(deleteDoc(doc(ana(), 'houses', 'h1')));
  });
});

describe('assets', () => {
  const chunk = (owner) => ({ ownerUid: owner, data: Bytes.fromUint8Array(new Uint8Array(10)) });
  const meta = (owner) => ({
    ownerUid: owner,
    mime: 'image/jpeg',
    size: 10,
    sha256: 'a'.repeat(64),
    chunkCount: 1,
    createdAt: serverTimestamp(),
  });

  it('se suben los trozos y la ficha; después son inmutables', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'assets', 'a1', 'chunks', '0'), chunk('ana')));
    // Reintento propio antes de cerrar la ficha: permitido.
    await assertSucceeds(setDoc(doc(ana(), 'assets', 'a1', 'chunks', '0'), chunk('ana')));
    await assertFails(setDoc(doc(beto(), 'assets', 'a1', 'chunks', '0'), chunk('beto')));
    await assertSucceeds(setDoc(doc(ana(), 'assets', 'a1'), meta('ana')));
    await assertFails(setDoc(doc(ana(), 'assets', 'a1', 'chunks', '1'), chunk('ana')));
    await assertFails(setDoc(doc(ana(), 'assets', 'a1'), meta('ana')));
    await assertSucceeds(getDoc(doc(anon(), 'assets', 'a1', 'chunks', '0')));
    await assertSucceeds(getDoc(doc(anon(), 'assets', 'a1')));
  });

  it('sin identidad no se sube nada', async () => {
    await assertFails(setDoc(doc(anon(), 'assets', 'a2', 'chunks', '0'), chunk('ana')));
    await assertFails(setDoc(doc(anon(), 'assets', 'a2'), meta('ana')));
  });
});
