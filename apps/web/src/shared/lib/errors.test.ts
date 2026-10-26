import { DomainError } from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { describeDomainError, describeLoadError, formatPath } from './errors';

describe('mensajes de error', () => {
  it('traduce errores de dominio con sus parámetros', () => {
    expect(describeDomainError(new DomainError('too-short', 'x', { min: 300 }))).toBe(
      'Esa medida deja un lado de menos de 300 mm.',
    );
  });

  it('formatea rutas de esquema', () => {
    expect(formatPath(['levels', 0, 'walls', 3, 'thickness'])).toBe('levels[0].walls[3].thickness');
  });

  it('describe errores de carga', () => {
    expect(describeLoadError({ kind: 'newer-version', fileVersion: 7 }).summary).toContain('v7');
    const schema = describeLoadError({
      kind: 'schema',
      issues: [{ path: ['meta', 'name'], message: 'requerido' }],
    });
    expect(schema.details).toEqual(['meta.name: requerido']);
    const integrity = describeLoadError({
      kind: 'integrity',
      issues: [{ code: 'duplicate-id', path: ['levels', 0], params: { id: 'wall_1' } }],
    });
    expect(integrity.details).toEqual(['levels[0]: Identificador repetido: wall_1']);
  });
});
