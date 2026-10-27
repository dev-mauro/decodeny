/**
 * Códigos de error del dominio. La UI los traduce (i18n); el dominio no contiene textos de UI.
 */
export type DomainErrorCode =
  | 'not-found'
  | 'invalid-argument'
  | 'invalid-geometry'
  | 'too-short'
  | 'out-of-range'
  /** Un vano no cabe en su muro (`params.reason`: `height`, `wall` u `overlap`). */
  | 'opening-conflict'
  /** El documento está bloqueado para edición (lo decide la aplicación, p. ej. «solo lectura»). */
  | 'read-only';

export class DomainError extends Error {
  override readonly name = 'DomainError';

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly params: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
