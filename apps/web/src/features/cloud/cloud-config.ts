/**
 * Configuración de la nube desde el build (`VITE_FIREBASE_*`). La configuración web de Firebase
 * es pública por diseño (la seguridad está en las reglas). Sin ella, la nube queda desactivada y
 * la app funciona como siempre: solo maquetas locales.
 */
export interface CloudConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
  /** Emuladores locales (`127.0.0.1`): desarrollo y E2E, nunca en producción. */
  readonly emulatorHost: string | null;
}

export const EMULATOR_PORTS = { firestore: 8181, auth: 9199 } as const;

export function readCloudConfig(
  env: Partial<Record<string, string>> = import.meta.env,
): CloudConfig | null {
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    projectId,
    appId,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    emulatorHost: env.VITE_FIREBASE_EMULATOR_HOST?.trim() ? env.VITE_FIREBASE_EMULATOR_HOST : null,
  };
}
