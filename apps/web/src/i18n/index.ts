import { configureValidationLocale } from '@decodeny/domain';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { es } from './locales/es';

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

const STORAGE_KEY = 'decodeny.locale';

/**
 * Idioma elegido por el usuario o español (el público objetivo es hispanohablante; el inglés
 * se elige explícitamente y se recuerda).
 */
function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'es' || stored === 'en') return stored;
  } catch {
    // Sin almacenamiento local (tests, modo privado estricto).
  }
  return DEFAULT_LOCALE;
}

const locale = initialLocale();

void i18next.use(initReactI18next).init({
  lng: locale,
  fallbackLng: DEFAULT_LOCALE,
  resources: { es: { translation: es }, en: { translation: en } },
  interpolation: { escapeValue: false },
  returnNull: false,
});

function applyLocale(next: Locale): void {
  configureValidationLocale(next);
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}
applyLocale(locale);

/** Cambia el idioma de la interfaz (cotas, catálogo y mensajes incluidos) y lo recuerda. */
export function setLocale(next: Locale): void {
  void i18next.changeLanguage(next);
  applyLocale(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Preferencia no persistida: vale para esta sesión.
  }
}

export { i18next };

/**
 * Traduce una clave construida en tiempo de ejecución (p. ej. a partir de un código de error
 * del dominio). Pierde el tipado estricto de claves/parámetros, por eso se limita a ese uso.
 */
export function translateDynamic(
  key: string,
  params: Readonly<Record<string, unknown>> = {},
): string {
  return (i18next.t as (key: string, options: Record<string, unknown>) => string)(key, {
    ...params,
  });
}
