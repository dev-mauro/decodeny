/// <reference types="vite/client" />

/** Versión de la app, inyectada por Vite desde package.json. */
declare const __APP_VERSION__: string;

/** Configuración de la nube (ADR-0012), opcional: sin ella, solo maquetas locales. */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** Emuladores locales (desarrollo y E2E). */
  readonly VITE_FIREBASE_EMULATOR_HOST?: string;
}
