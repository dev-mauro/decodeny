import { FirebaseError, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  signInAnonymously,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  Bytes,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore/lite';
import { deflateText, inflateText } from '@/shared/lib/compression';
import { EMULATOR_PORTS, type CloudConfig } from '../cloud-config';
import {
  CloudError,
  type CloudBackend,
  type CloudIdentity,
  type HouseContent,
  type HouseSnapshot,
} from '../ports';

/**
 * Backend de la nube sobre Firebase (ADR-0012): Auth anónima + Firestore *lite* (REST, sin
 * escuchas ni caché: lo local vive en IndexedDB y la colaboración va por WebRTC). Es el único
 * módulo que importa `firebase/*` (lo verifica dependency-cruiser) y se carga bajo demanda.
 *
 * Modelo: `houses/{id}` con el proyecto comprimido en un campo `Bytes` sin índice, y
 * `assets/{id}` (ficha) + `assets/{id}/chunks/{n}` (trozos de ≤ 900 kB), inmutables.
 */

/** Límites (los mismos que imponen las reglas). */
const MAX_PROJECT_BYTES = 900_000;
const CHUNK_BYTES = 900_000;
const MAX_ASSET_BYTES = 16 * 1024 * 1024;

function cloudError(error: unknown): CloudError {
  if (error instanceof CloudError) return error;
  if (error instanceof FirebaseError) {
    const code = error.code.replace(/^(firestore|auth)\//, '');
    if (code === 'permission-denied') return new CloudError('forbidden', error);
    if (code === 'not-found') return new CloudError('not-found', error);
  }
  // El resto (sin red, contención de la transacción, cuotas) se puede reintentar.
  return new CloudError('unavailable', error);
}

/** Ejecuta una operación traduciendo los errores de Firebase a `CloudError`. */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw cloudError(error);
  }
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const millis = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : 0);

class FirebaseBackend implements CloudBackend {
  readonly #auth: Auth;
  readonly #db: Firestore;

  constructor(config: CloudConfig) {
    const app = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      appId: config.appId,
    });
    // Sin resolutor de popups/redirecciones: hoy solo hay identidad anónima (bundle menor).
    this.#auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
    this.#db = getFirestore(app);
    if (config.emulatorHost) {
      connectAuthEmulator(this.#auth, `http://${config.emulatorHost}:${EMULATOR_PORTS.auth}`, {
        disableWarnings: true,
      });
      connectFirestoreEmulator(this.#db, config.emulatorHost, EMULATOR_PORTS.firestore);
    }
  }

  readonly identity = {
    current: async (): Promise<CloudIdentity | null> => {
      await this.#auth.authStateReady();
      const user = this.#auth.currentUser;
      return user ? identityOf(user) : null;
    },
    ensure: () =>
      guarded(async () => {
        const current = await this.identity.current();
        if (current) return current;
        return identityOf((await signInAnonymously(this.#auth)).user);
      }),
  };

  readonly houses = {
    get: (id: string) =>
      guarded(async (): Promise<HouseSnapshot | null> => {
        const snap = await getDoc(doc(this.#db, 'houses', id));
        if (!snap.exists()) return null;
        const data = snap.data();
        return {
          id,
          ownerUid: String(data.ownerUid),
          forkOf: typeof data.forkOf === 'string' ? data.forkOf : null,
          name: String(data.name),
          project: await inflateText(
            (data.project as Bytes).toUint8Array() as Uint8Array<ArrayBuffer>,
          ),
          assets: Array.isArray(data.assets) ? (data.assets as string[]) : [],
          rev: Number(data.rev),
          lastVisitAt: millis(data.lastVisitAt),
        };
      }),

    create: (owner: CloudIdentity, content: HouseContent, forkOf: string | null) =>
      guarded(async () => {
        const ref = doc(collection(this.#db, 'houses'));
        await setDoc(ref, {
          v: 1,
          ownerUid: owner.uid,
          forkOf,
          ...(await this.#content(content)),
          rev: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastVisitAt: serverTimestamp(),
        });
        return ref.id;
      }),

    update: (owner: CloudIdentity, id: string, expectedRev: number, content: HouseContent) =>
      guarded(async () => {
        const fields = await this.#content(content);
        const ref = doc(this.#db, 'houses', id);
        return runTransaction(this.#db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new CloudError('not-found');
          const data = snap.data();
          if (data.ownerUid !== owner.uid) throw new CloudError('forbidden');
          if (data.rev !== expectedRev) throw new CloudError('conflict');
          const rev = expectedRev + 1;
          tx.update(ref, {
            ...fields,
            rev,
            updatedAt: serverTimestamp(),
            lastVisitAt: serverTimestamp(),
          });
          return rev;
        });
      }),

    recordVisit: (id: string) =>
      guarded(() => updateDoc(doc(this.#db, 'houses', id), { lastVisitAt: serverTimestamp() })),
  };

  readonly assets = {
    has: (id: string) => guarded(async () => (await getDoc(doc(this.#db, 'assets', id))).exists()),

    put: (owner: CloudIdentity, id: string, blob: Blob) =>
      guarded(async () => {
        if (await this.assets.has(id)) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.length > MAX_ASSET_BYTES) throw new CloudError('too-large');
        const chunkCount = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
        for (let i = 0; i < chunkCount; i++) {
          const part = bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
          await setDoc(doc(this.#db, 'assets', id, 'chunks', String(i)), {
            ownerUid: owner.uid,
            data: Bytes.fromUint8Array(part),
          });
        }
        // La ficha, al final, da los trozos por completos.
        await setDoc(doc(this.#db, 'assets', id), {
          ownerUid: owner.uid,
          mime: blob.type,
          size: bytes.length,
          sha256: await sha256(bytes),
          chunkCount,
          createdAt: serverTimestamp(),
        });
      }),

    get: (id: string) =>
      guarded(async () => {
        const meta = await getDoc(doc(this.#db, 'assets', id));
        if (!meta.exists()) return null;
        const {
          chunkCount,
          mime,
          sha256: expected,
        } = meta.data() as {
          chunkCount: number;
          mime: string;
          sha256: string;
        };
        const parts = await Promise.all(
          Array.from({ length: chunkCount }, async (_, i) => {
            const snap = await getDoc(doc(this.#db, 'assets', id, 'chunks', String(i)));
            return (snap.get('data') as Bytes).toUint8Array();
          }),
        );
        const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let offset = 0;
        for (const part of parts) {
          bytes.set(part, offset);
          offset += part.length;
        }
        // Inmutable y verificable: si el contenido no coincide con su huella, se descarta.
        if ((await sha256(bytes)) !== expected) return null;
        return new Blob([bytes], { type: mime });
      }),
  };

  /** Campos del contenido: el proyecto comprimido (si cabe) y los assets que usa. */
  async #content(content: HouseContent) {
    const packed = await deflateText(content.project);
    if (packed.length > MAX_PROJECT_BYTES) throw new CloudError('too-large');
    return {
      name: content.name.slice(0, 120),
      project: Bytes.fromUint8Array(packed),
      projectSchemaVersion: content.projectSchemaVersion,
      assets: [...content.assets],
    };
  }
}

const identityOf = (user: User): CloudIdentity => ({
  uid: user.uid,
  kind: user.isAnonymous ? 'anonymous' : 'account',
});

export function createFirebaseBackend(config: CloudConfig): CloudBackend {
  return new FirebaseBackend(config);
}
