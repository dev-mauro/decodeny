import { checkIntegrity, type IntegrityIssue } from '../model/integrity';
import { ProjectSchema } from '../model/schema';
import type { Project } from '../model/types';
import { migrateDocument, MIGRATIONS, type Migration, type RawDocument } from './migrations';

export const PROJECT_FILE_EXTENSION = '.decodeny.json';
export const PROJECT_FILE_MIME = 'application/json';

export interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export type ProjectLoadError =
  | { readonly kind: 'invalid-json' }
  | { readonly kind: 'not-a-project' }
  | { readonly kind: 'newer-version'; readonly fileVersion: number }
  | { readonly kind: 'missing-migration'; readonly fromVersion: number }
  | { readonly kind: 'schema'; readonly issues: readonly SchemaIssue[] }
  | { readonly kind: 'integrity'; readonly issues: readonly IntegrityIssue[] };

export type ProjectLoadResult =
  | { readonly ok: true; readonly project: Project; readonly migratedFrom: number | null }
  | { readonly ok: false; readonly error: ProjectLoadError };

export interface SerializeOptions {
  readonly now?: Date;
  readonly generator?: string;
}

/** Serializa el proyecto a JSON legible, actualizando `updatedAt` y `generator`. */
export function serializeProject(project: Project, options: SerializeOptions = {}): string {
  const doc: Project = {
    ...project,
    meta: {
      ...project.meta,
      updatedAt: (options.now ?? new Date()).toISOString(),
      generator: options.generator ?? project.meta.generator,
    },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Pipeline de carga: JSON → migraciones → esquema → integridad. */
export function loadProject(
  input: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
): ProjectLoadResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: { kind: 'not-a-project' } };
  }
  const migrated = migrateDocument(input as RawDocument, migrations);
  if (!migrated.ok) {
    switch (migrated.reason) {
      case 'missing-version':
        return { ok: false, error: { kind: 'not-a-project' } };
      case 'newer-version':
        return { ok: false, error: { kind: 'newer-version', fileVersion: migrated.fileVersion } };
      case 'missing-migration':
        return {
          ok: false,
          error: { kind: 'missing-migration', fromVersion: migrated.fromVersion },
        };
    }
  }
  const parsed = ProjectSchema.safeParse(migrated.doc);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
    };
  }
  const integrity = checkIntegrity(parsed.data);
  if (integrity.length > 0) return { ok: false, error: { kind: 'integrity', issues: integrity } };
  return {
    ok: true,
    project: parsed.data,
    migratedFrom: migrated.fromVersion === parsed.data.schemaVersion ? null : migrated.fromVersion,
  };
}

export function parseProjectFile(
  text: string,
  migrations: readonly Migration[] = MIGRATIONS,
): ProjectLoadResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: { kind: 'invalid-json' } };
  }
  return loadProject(json, migrations);
}

/** `Mi Depto.` → `mi-depto.decodeny.json` */
export function projectFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'proyecto'}${PROJECT_FILE_EXTENSION}`;
}
