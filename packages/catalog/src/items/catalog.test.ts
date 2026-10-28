import {
  buildItemParts,
  itemAffordances,
  defaultParams,
  definitionEnvelope,
  DefinitionRefSchema,
  partsBounds,
  resolveParams,
  type AnyItemDefinition,
  type ParamSpec,
  type Part,
  type ResolvedParams,
} from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import {
  ITEM_CATEGORIES,
  itemCatalog,
  itemEnvelope,
  resolveItemDefinition,
  unknownItem,
} from './index';

/**
 * Contrato del catálogo de muebles (plan §I4): **cada definición registrada** construye piezas
 * válidas con parámetros por defecto, mínimos, máximos, cada opción y cada preset, y su caja
 * envolvente coincide con ancho × profundidad × alto (±1 mm). Escala solo con el contenido.
 */
const definitions = [...itemCatalog.list(), unknownItem];

function variants(def: AnyItemDefinition): ResolvedParams[] {
  const base = defaultParams(def.params);
  const extreme = (pick: (spec: ParamSpec) => number | undefined) =>
    resolveParams(
      def.params,
      Object.fromEntries(
        Object.entries(def.params).flatMap(([k, spec]) => {
          const v = pick(spec);
          return v === undefined ? [] : [[k, v]];
        }),
      ),
    );
  const list: ResolvedParams[] = [
    base,
    extreme((s) => (s.kind === 'length' || s.kind === 'number' ? s.min : undefined)),
    extreme((s) => (s.kind === 'length' || s.kind === 'number' ? s.max : undefined)),
  ];
  for (const [key, spec] of Object.entries(def.params)) {
    if (spec.kind === 'choice') {
      for (const option of spec.options) list.push({ ...base, [key]: option.value });
    }
    if (spec.kind === 'boolean') list.push({ ...base, [key]: !spec.default });
  }
  for (const preset of def.presets ?? [])
    list.push(resolveParams(def.params, { ...base, ...preset.params }));
  return list;
}

const finite = (values: readonly number[]) => values.every((v) => Number.isFinite(v));

function checkPart(part: Part) {
  if (part.kind === 'box') {
    expect(finite([...part.size, ...part.at, part.rotationY ?? 0])).toBe(true);
    part.size.forEach((s) => expect(s).toBeGreaterThan(0));
  } else {
    expect(finite([part.radius, part.radiusTop ?? 0, part.height, ...part.at])).toBe(true);
    expect(part.radius).toBeGreaterThan(0);
    expect(part.height).toBeGreaterThan(0);
  }
}

describe.each(definitions.map((d) => [d.id, d] as const))('%s', (_, def) => {
  it('tiene referencia válida, nombre y categoría conocida', () => {
    expect(DefinitionRefSchema.safeParse(def.id).success).toBe(true);
    expect(def.name.es.length).toBeGreaterThan(0);
    expect(ITEM_CATEGORIES).toContain(def.category);
  });

  it('los valores por defecto y los presets están dentro de rango', () => {
    for (const spec of Object.values(def.params)) {
      if (spec.kind === 'length' || spec.kind === 'number') {
        expect(spec.default).toBeGreaterThanOrEqual(spec.min);
        expect(spec.default).toBeLessThanOrEqual(spec.max);
      }
    }
    for (const preset of def.presets ?? []) {
      // Un preset no debe ser recortado al resolverse.
      const resolved = resolveParams(def.params, preset.params);
      for (const [key, value] of Object.entries(preset.params)) expect(resolved[key]).toBe(value);
    }
  });

  it('su caja envolvente coincide con sus medidas en todas las variantes', () => {
    for (const params of variants(def)) {
      const parts = buildItemParts(def, params);
      expect(parts.length).toBeGreaterThan(0);
      parts.forEach(checkPart);
      const env = definitionEnvelope(def, params);
      const b = partsBounds(parts);
      const ctx = JSON.stringify(params);
      expect(b.min[0], ctx).toBeCloseTo(-env.width / 2, 0);
      expect(b.max[0], ctx).toBeCloseTo(env.width / 2, 0);
      expect(b.min[2], ctx).toBeCloseTo(-env.depth / 2, 0);
      expect(b.max[2], ctx).toBeCloseTo(env.depth / 2, 0);
      // Lo que abre la losa de arriba (un vacío) puede no tener cuerpo abajo: solo sus barandas.
      if (def.floorOpening) expect(b.min[1], ctx).toBeGreaterThanOrEqual(-0.5);
      else expect(b.min[1], ctx).toBeCloseTo(0, 0);
      expect(b.max[1], ctx).toBeCloseTo(env.height, 0);
      for (const a of itemAffordances(def, params)) {
        expect(finite([...a.at])).toBe(true);
        expect(a.at[1]).toBeLessThanOrEqual(env.height);
      }
    }
  });
});

describe('catálogo de muebles', () => {
  it('cubre todas las categorías del plan', () => {
    const categories = new Set(itemCatalog.list().map((d) => d.category));
    for (const c of ITEM_CATEGORIES) expect(categories.has(c)).toBe(true);
  });

  it('paramétrico, no escalado: el ancho no cambia el grosor de las patas', () => {
    const table = itemCatalog.require('furniture.table-rect@1');
    const legWidths = (width: number) =>
      table
        .build(resolveParams(table.params, { width }))
        .filter((p) => p.kind === 'box' && p.slot === 'wood' && p.size[1] > 100)
        .map((p) => (p.kind === 'box' ? p.size[0] : 0));
    expect(legWidths(800)).toEqual(legWidths(3000));
    expect(legWidths(800)).toHaveLength(4);
  });

  it('las camas declaran donde acostarse y las sillas donde sentarse', () => {
    const kinds = (id: string) =>
      itemCatalog
        .require(id)
        .affordances?.(defaultParams(itemCatalog.require(id).params))
        .map((a) => a.kind);
    expect(kinds('furniture.bed@1')).toEqual(['lie']);
    expect(kinds('furniture.chair-dining@1')).toEqual(['sit']);
    expect(kinds('furniture.sofa@1')).toEqual(['sit', 'sit', 'sit']);
  });

  it('las luminarias emiten luz solo encendidas, con su flujo y temperatura', () => {
    const lights = itemCatalog.list().filter((d) => d.category === 'lighting');
    expect(lights.length).toBeGreaterThanOrEqual(6);
    for (const def of lights) {
      const params = defaultParams(def.params);
      const emitters = def.emitters?.(params) ?? [];
      expect(emitters.length, def.id).toBeGreaterThan(0);
      const total = emitters.reduce((sum, e) => sum + e.lumens, 0);
      expect(total).toBeCloseTo(Number(params.lumens), 6);
      expect(def.emitters?.({ ...params, on: false })).toEqual([]);
    }
  });

  it('declara montajes de muro, cielo y superficie', () => {
    const mounts = new Set(itemCatalog.list().map((d) => d.mount));
    expect([...mounts].sort()).toEqual(['ceiling', 'floor', 'surface', 'wall']);
  });

  it('resuelve tipos desconocidos y la envolvente de items del documento', () => {
    expect(resolveItemDefinition('furniture.throne@9')).toBe(unknownItem);
    expect(itemEnvelope({ def: 'furniture.table-round@1', params: { diameter: 1200 } })).toEqual({
      width: 1200,
      depth: 1200,
      height: 750,
    });
    expect(
      itemEnvelope({ def: 'furniture.throne@9', params: { width: 800, depth: 700, height: 1500 } }),
    ).toEqual({
      width: 800,
      depth: 700,
      height: 1500,
    });
  });
});
