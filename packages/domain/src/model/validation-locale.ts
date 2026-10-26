import { z } from 'zod';

export type ValidationLocale = 'es' | 'en';

/** Idioma de los mensajes de validación de esquema (errores al importar archivos). */
export function configureValidationLocale(locale: ValidationLocale): void {
  z.config(locale === 'es' ? z.locales.es() : z.locales.en());
}
