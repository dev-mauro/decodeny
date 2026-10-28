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

describe('rooms', () => {
  const roomDoc = (hostUid, overrides = {}) => ({
    hostUid,
    hostName: 'Ana',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 3600_000),
    ...overrides,
  });
  const requestDoc = (guestUid, overrides = {}) => ({
    guestUid,
    name: 'Beto',
    offer: 'v=0 oferta',
    createdAt: serverTimestamp(),
    ...overrides,
  });
  const carla = () => env.authenticatedContext('carla').firestore();

  async function openRoom(code = 'K7Q4MD') {
    await assertSucceeds(setDoc(doc(ana(), 'rooms', code), roomDoc('ana')));
    return code;
  }

  it('solo se crea con un código válido, a nombre propio y con vencimiento corto', async () => {
    await openRoom();
    await assertFails(setDoc(doc(ana(), 'rooms', 'k7q4md'), roomDoc('ana')));
    await assertFails(setDoc(doc(ana(), 'rooms', 'ABC10O'), roomDoc('ana')));
    await assertFails(setDoc(doc(beto(), 'rooms', 'BBBBBB'), roomDoc('ana')));
    await assertFails(setDoc(doc(anon(), 'rooms', 'CCCCCC'), roomDoc('ana')));
    await assertFails(
      setDoc(
        doc(ana(), 'rooms', 'DDDDDD'),
        roomDoc('ana', { expiresAt: Timestamp.fromMillis(Date.now() + 48 * 3600_000) }),
      ),
    );
    // No se puede pisar una sala existente.
    await assertFails(setDoc(doc(beto(), 'rooms', 'K7Q4MD'), roomDoc('beto')));
  });

  it('se lee con el código, pero no se listan salas', async () => {
    await openRoom();
    await assertSucceeds(getDoc(doc(beto(), 'rooms', 'K7Q4MD')));
    await assertFails(getDocs(collection(beto(), 'rooms')));
  });

  it('la solicitud la ven solo el invitado y el anfitrión, que contesta una vez', async () => {
    const code = await openRoom();
    const ref = (db) => doc(db, 'rooms', code, 'requests', 'r1');
    await assertSucceeds(setDoc(ref(beto()), requestDoc('beto')));
    await assertFails(setDoc(doc(carla(), 'rooms', code, 'requests', 'r2'), requestDoc('beto')));
    await assertSucceeds(getDoc(ref(beto())));
    await assertSucceeds(getDoc(ref(ana())));
    await assertFails(getDoc(ref(carla())));
    await assertSucceeds(getDocs(collection(ana(), 'rooms', code, 'requests')));
    await assertFails(getDocs(collection(beto(), 'rooms', code, 'requests')));
    // Solo el anfitrión responde, una sola vez y sin tocar la oferta.
    await assertFails(updateDoc(ref(beto()), { answer: 'falsa' }));
    await assertFails(updateDoc(ref(ana()), { answer: 'a', offer: 'otra' }));
    await assertSucceeds(updateDoc(ref(ana()), { answer: 'v=0 respuesta' }));
    await assertFails(updateDoc(ref(ana()), { answer: 'otra vez' }));
    await assertSucceeds(deleteDoc(ref(beto())));
  });

  it('sin sala (o vencida) no se puede pedir entrar; solo el anfitrión la cierra', async () => {
    await assertFails(setDoc(doc(beto(), 'rooms', 'NNNNNN', 'requests', 'r1'), requestDoc('beto')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'rooms', 'PPPPPP'), {
        ...roomDoc('ana'),
        createdAt: Timestamp.fromMillis(Date.now() - 2 * 3600_000),
        expiresAt: Timestamp.fromMillis(Date.now() - 3600_000),
      });
    });
    await assertFails(setDoc(doc(beto(), 'rooms', 'PPPPPP', 'requests', 'r1'), requestDoc('beto')));
    const code = await openRoom('HHHHHH');
    await assertFails(deleteDoc(doc(beto(), 'rooms', code)));
    await assertSucceeds(deleteDoc(doc(ana(), 'rooms', code)));
  });
});
