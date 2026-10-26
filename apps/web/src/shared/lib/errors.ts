import type { DomainError, IntegrityIssue, ProjectLoadError } from '@decodeny/domain';
import { i18next, translateDynamic } from '@/i18n';

export function describeDomainError(error: DomainError): string {
  if (error.code === 'opening-conflict') {
    return translateDynamic(
      `errors.opening.${String(error.params.reason ?? 'wall')}`,
      error.params,
    );
  }
  return translateDynamic(`errors.${error.code}`, error.params);
}

export function describeIntegrityIssue(issue: IntegrityIssue): string {
  return translateDynamic(`integrity.${issue.code}`, issue.params);
}

export const formatPath = (path: readonly PropertyKey[]): string =>
  path
    .map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`))
    .join('')
    .replace(/^\./, '');

export interface LoadErrorDescription {
  readonly summary: string;
  readonly details: readonly string[];
}

export function describeLoadError(error: ProjectLoadError): LoadErrorDescription {
  const t = i18next.t.bind(i18next);
  switch (error.kind) {
    case 'invalid-json':
    case 'not-a-project':
      return { summary: t(`io.errors.${error.kind}`), details: [] };
    case 'newer-version':
      return { summary: t('io.errors.newer-version', { version: error.fileVersion }), details: [] };
    case 'missing-migration':
      return {
        summary: t('io.errors.missing-migration', { version: error.fromVersion }),
        details: [],
      };
    case 'schema':
      return {
        summary: t('io.errors.schema'),
        details: error.issues.slice(0, 20).map((i) => `${formatPath(i.path)}: ${i.message}`),
      };
    case 'integrity':
      return {
        summary: t('io.errors.integrity'),
        details: error.issues
          .slice(0, 20)
          .map((i) => `${formatPath(i.path)}: ${describeIntegrityIssue(i)}`),
      };
  }
}
