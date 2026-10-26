import { DefinitionRefSchema, HEX_COLOR, defaultParams } from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { materialCatalog, materialsFor, resolveMaterialDefinition, unknownMaterial } from './index';

/** Contrato del catálogo de materiales: recorre todas las definiciones registradas. */
describe.each(materialCatalog.list().map((m) => [m.id, m] as const))('%s', (_, def) => {
  it('tiene referencia, nombre, color y superficies válidos', () => {
    expect(DefinitionRefSchema.safeParse(def.id).success).toBe(true);
    expect(def.name.es.length).toBeGreaterThan(0);
    expect(HEX_COLOR.test(def.color)).toBe(true);
    for (const c of def.swatches ?? []) expect(HEX_COLOR.test(c)).toBe(true);
    expect(def.surfaces.length).toBeGreaterThan(0);
    expect(def.roughness).toBeGreaterThanOrEqual(0);
    expect(def.roughness).toBeLessThanOrEqual(1);
  });

  it('sus parámetros por defecto están en rango', () => {
    const params = defaultParams(def.params);
    for (const [key, spec] of Object.entries(def.params)) {
      if (spec.kind === 'length' || spec.kind === 'number') {
        expect(params[key]).toBeGreaterThanOrEqual(spec.min);
        expect(params[key]).toBeLessThanOrEqual(spec.max);
      }
      if (spec.kind === 'color') expect(HEX_COLOR.test(String(params[key]))).toBe(true);
    }
  });
});

describe('catálogo de materiales', () => {
  it('cubre muros, pisos y cielos con el contenido del plan', () => {
    expect(materialsFor('wall').length).toBeGreaterThanOrEqual(6);
    expect(materialsFor('floor').length).toBeGreaterThanOrEqual(8);
    expect(materialsFor('ceiling').length).toBeGreaterThanOrEqual(1);
  });

  it('un material desconocido se resuelve con el de reemplazo', () => {
    expect(resolveMaterialDefinition('floor.oak@1').id).toBe('floor.oak@1');
    expect(resolveMaterialDefinition('floor.marble@7')).toBe(unknownMaterial);
  });
});
