import { CURRENT_SCHEMA_VERSION } from '../model/schema';

export type RawDocument = Record<string, unknown>;

/** Transforma un documento de la versión `from` a `from + 1`. Debe ser pura y total. */
export interface Migration {
  readonly from: number;
  readonly migrate: (doc: RawDocument) => RawDocument;
}

/**
 * Migraciones registradas, en orden. Al subir `CURRENT_SCHEMA_VERSION` se agrega aquí
 * una migración `{ from: N - 1 }` junto a un fixture del formato anterior en los tests.
 */
export const MIGRATIONS: readonly Migration[] = [];

export type MigrationOutcome =
  | { readonly ok: true; readonly doc: RawDocument; readonly fromVersion: number }
  | { readonly ok: false; readonly reason: 'missing-version' }
  | { readonly ok: false; readonly reason: 'newer-version'; readonly fileVersion: number }
  | { readonly ok: false; readonly reason: 'missing-migration'; readonly fromVersion: number };

export function migrateDocument(
  doc: RawDocument,
  migrations: readonly Migration[] = MIGRATIONS,
  target: number = CURRENT_SCHEMA_VERSION,
): MigrationOutcome {
  const version = doc.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'missing-version' };
  }
  if (version > target) return { ok: false, reason: 'newer-version', fileVersion: version };
  let current = doc;
  for (let v = version; v < target; v++) {
    const step = migrations.find((m) => m.from === v);
    if (!step) return { ok: false, reason: 'missing-migration', fromVersion: v };
    current = { ...step.migrate(current), schemaVersion: v + 1 };
  }
  return { ok: true, doc: current, fromVersion: version };
}
