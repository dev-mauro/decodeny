import {
  addOpening,
  checkIntegrity,
  createEmptyProject,
  createRectangularRoom,
  DefinitionRefSchema,
  defaultParams,
  executeCommand,
  isDesignedClosed,
  operableParams,
  openingEnvelope,
  resolveParams,
  roomSides,
  sequentialIds,
  type AnyOpeningDefinition,
  type ParamSpec,
  type Part,
  type Project,
  type ResolvedParams,
} from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { openingCatalog, resolveOpeningDefinition, unknownOpening } from './index';

/**
 * Contrato del catálogo: recorre **todas** las definiciones registradas, de modo que cada tipo
 * nuevo de puerta o ventana queda verificado sin escribir tests adicionales.
 */
const definitions = [...openingCatalog.list(), unknownOpening];

/** Variantes de parámetros: defaults, todos al mínimo, todos al máximo y cada opción. */
function variants(def: AnyOpeningDefinition): ResolvedParams[] {
  const base = defaultParams(def.params);
  const extreme = (pick: (spec: ParamSpec) => unknown) =>
    resolveParams(
      def.params,
      Object.fromEntries(
        Object.entries(def.params).map(([k, spec]) => [k, pick(spec) as number | string | boolean]),
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
  }
  return list;
}

const finite = (values: readonly number[]) => values.every((v) => Number.isFinite(v));

function checkParts(parts: readonly Part[], params: ResolvedParams) {
  const { width, height, sill } = openingEnvelope({ params });
  expect(parts.length).toBeGreaterThan(0);
  for (const part of parts) {
    // Los vanos se arman con cajas; otras primitivas se validan en el contrato de muebles.
    if (part.kind !== 'box') throw new Error(`Primitiva inesperada en un vano: ${part.kind}`);
    expect(finite([...part.size, ...part.at, part.rotationY ?? 0])).toBe(true);
    part.size.forEach((s) => expect(s).toBeGreaterThan(0));
    // Nada queda bajo el piso ni muy por encima del vano (rieles incluidos).
    expect(part.at[1] - part.size[1] / 2).toBeGreaterThanOrEqual(sill - 1);
    expect(part.at[1] + part.size[1] / 2).toBeLessThanOrEqual(sill + height + 60);
    // El marco no se sale del ancho del vano.
    if (part.slot === 'frame' || part.slot === 'trim') {
      expect(Math.abs(part.at[0]) + part.size[0] / 2).toBeLessThanOrEqual(width / 2 + 1);
    }
  }
}

describe.each(definitions.map((d) => [d.id, d] as const))('%s', (_, def) => {
  it('tiene una referencia válida y una envolvente (ancho, alto)', () => {
    expect(DefinitionRefSchema.safeParse(def.id).success).toBe(true);
    expect(def.params.width?.kind).toBe('length');
    expect(def.params.height?.kind).toBe('length');
    if (def.params.sill) expect(def.params.sill.kind).toBe('length');
    expect(def.name.es.length).toBeGreaterThan(0);
  });

  it('los valores por defecto están dentro de rango', () => {
    for (const spec of Object.values(def.params)) {
      if (spec.kind === 'length' || spec.kind === 'number') {
        expect(spec.default).toBeGreaterThanOrEqual(spec.min);
        expect(spec.default).toBeLessThanOrEqual(spec.max);
      }
      if (spec.kind === 'choice') {
        expect(spec.options.map((o) => o.value)).toContain(spec.default);
        if (spec.semantic === 'wall-face') {
          expect(spec.options.map((o) => o.value).sort()).toEqual(['left', 'right']);
        }
        if (spec.semantic === 'wall-end') {
          expect(spec.options.map((o) => o.value).sort()).toEqual(['end', 'start']);
        }
      }
    }
  });

  it('si se abre en el recorrido, su parámetro existe y cerrada genera piezas válidas', () => {
    if (!def.operable) return;
    const spec = def.params[def.operable.param];
    expect(spec?.kind).toBe('number');
    if (spec?.kind !== 'number') return;
    expect(def.operable.closed).toBeGreaterThanOrEqual(spec.min);
    expect(def.operable.closed).toBeLessThanOrEqual(spec.max);
    for (const t of [0, 0.5, 1]) {
      const params = operableParams(def, {}, t);
      checkParts(def.build(params, { wallThickness: 150 }), params);
    }
    // Cerrada en el documento: abierta toma el valor por defecto.
    expect(isDesignedClosed(def, { [def.operable.param]: def.operable.closed })).toBe(true);
    expect(
      operableParams(def, { [def.operable.param]: def.operable.closed }, 1)[def.operable.param],
    ).toBe(spec.default);
  });

  it('genera piezas válidas con parámetros extremos y espesores de muro distintos', () => {
    for (const params of variants(def)) {
      for (const wallThickness of [80, 150, 300]) {
        checkParts(def.build(params, { wallThickness }), params);
        for (const stroke of def.plan?.(params, { wallThickness }) ?? []) {
          expect(stroke.points.length).toBeGreaterThanOrEqual(2);
          expect(finite(stroke.points.flat())).toBe(true);
        }
      }
    }
  });

  it('con sus valores por defecto cabe en un muro estándar de 2,40 m', () => {
    let project: Project = createEmptyProject({ name: 'P', levelName: 'L', generator: 't' });
    const ids = sequentialIds();
    const levelId = project.levels[0]!.id;
    project = executeCommand(
      project,
      createRectangularRoom,
      {
        levelId,
        name: 'R',
        origin: { x: 0, y: 0 },
        width: 9000,
        depth: 4000,
        height: 2400,
        thickness: 150,
      },
      { ids },
    ).project;
    const level = project.levels[0]!;
    const wallId = roomSides(level, level.rooms[0]!)[0]!.wallIds[0]!;
    const out = executeCommand(
      project,
      addOpening,
      { levelId, wallId, def: def.id, params: defaultParams(def.params) },
      { ids },
    );
    expect(checkIntegrity(out.project)).toEqual([]);
  });
});

describe('catálogo de vanos', () => {
  it('incluye puertas y ventanas', () => {
    const kinds = openingCatalog.list().map((d) => d.kind);
    expect(kinds.filter((k) => k === 'door').length).toBeGreaterThanOrEqual(4);
    expect(kinds.filter((k) => k === 'window').length).toBeGreaterThanOrEqual(4);
  });

  it('las puertas son transitables y las ventanas no', () => {
    for (const def of openingCatalog.list()) expect(def.passable).toBe(def.kind === 'door');
  });

  it('un tipo desconocido se resuelve con la definición de reemplazo', () => {
    expect(resolveOpeningDefinition('door.single@1').id).toBe('door.single@1');
    expect(resolveOpeningDefinition('door.revolving@3')).toBe(unknownOpening);
  });
});
