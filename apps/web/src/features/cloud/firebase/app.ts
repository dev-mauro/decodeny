import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  signInAnonymously,
  type Auth,
  type User,
} from 'firebase/auth';
import { EMULATOR_PORTS, type CloudConfig } from '../cloud-config';
import type { CloudIdentity } from '../ports';

/**
 * La app de Firebase y su identidad, una sola vez por página: la comparten el guardado de
 * maquetas (Firestore *lite*) y las salas de colaboración (Firestore con escuchas), así ambas
 * usan la misma identidad anónima.
 */
let shared: { readonly app: FirebaseApp; readonly auth: Auth } | null = null;

export function firebaseApp(config: CloudConfig): {
  readonly app: FirebaseApp;
  readonly auth: Auth;
} {
  if (shared) return shared;
  const app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
  });
  // Sin resolutor de popups/redirecciones: hoy solo hay identidad anónima (bundle menor).
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  if (config.emulatorHost) {
    connectAuthEmulator(auth, `http://${config.emulatorHost}:${EMULATOR_PORTS.auth}`, {
      disableWarnings: true,
    });
  }
  shared = { app, auth };
  return shared;
}

export const identityOf = (user: User): CloudIdentity => ({
  uid: user.uid,
  kind: user.isAnonymous ? 'anonymous' : 'account',
});

/** La identidad ya restaurada en este navegador, sin crear una. */
export async function currentIdentity(auth: Auth): Promise<CloudIdentity | null> {
  await auth.authStateReady();
  return auth.currentUser ? identityOf(auth.currentUser) : null;
}

/** La identidad actual o, si no hay, una anónima nueva. */
export async function ensureIdentity(auth: Auth): Promise<CloudIdentity> {
  return (await currentIdentity(auth)) ?? identityOf((await signInAnonymously(auth)).user);
}
