import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRectangularRoom, createRoomFromPath } from '../commands/rooms';
import { checkIntegrity } from '../model/integrity';
import type { Project } from '../model/types';
import { benchWithRoom, createBench, FIXED_NOW } from '../test-utils/fixtures';
import { migrateDocument, type Migration } from './migrations';
import { loadProject, parseProjectFile, projectFileName, serializeProject } from './project-file';

const clone = <T>(v: T): T => structuredClone(v);

describe('serialización', () => {
  it('ida y vuelta conserva el documento', () => {
    const { project } = benchWithRoom();
    const text = serializeProject(project, { now: FIXED_NOW });
    const loaded = parseProjectFile(text);
    expect(loaded).toEqual({ ok: true, project, migratedFrom: null });
  });

  it('actualiza updatedAt y generator al exportar', () => {
    const { project } = createBench();
    const now = new Date('2026-06-01T12:00:00.000Z');
    const parsed = JSON.parse(
      serializeProject(project, { now, generator: 'decodeny@9.9.9' }),
    ) as Project;
    expect(parsed.meta.updatedAt).toBe(now.toISOString());
    expect(parsed.meta.generator).toBe('decodeny@9.9.9');
    expect(parsed.meta.createdAt).toBe(project.meta.createdAt);
  });

  it('propiedad: export → import es identidad para proyectos generados', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            width: fc.integer({ min: 300, max: 20_000 }),
            depth: fc.integer({ min: 300, max: 20_000 }),
            height: fc.integer({ min: 500, max: 10_000 }),
            thickness: fc.integer({ min: 10, max: 500 }).map((t) => t * 2),
            name: fc.string({ maxLength: 80 }),
          }),
          { maxLength: 5 },
        ),
        (rooms) => {
          const bench = createBench();
          rooms.forEach((r, i) =>
            bench.run(createRectangularRoom, {
              ...r,
              levelId: bench.levelId,
              origin: { x: i * 25_000, y: 0 },
            }),
          );
          const loaded = parseProjectFile(serializeProject(bench.project, { now: FIXED_NOW }));
          expect(loaded.ok && loaded.project).toEqual(bench.project);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('genera nombres de archivo seguros', () => {
    expect(projectFileName('Depto Ñuñoa 3D/2B')).toBe('depto-nunoa-3d-2b.decodeny.json');
    expect(projectFileName('***')).toBe('proyecto.decodeny.json');
  });
});

describe('carga y validación', () => {
  it('rechaza JSON inválido y documentos que no son proyectos', () => {
    expect(parseProjectFile('{nope')).toEqual({ ok: false, error: { kind: 'invalid-json' } });
    expect(parseProjectFile('[]')).toEqual({ ok: false, error: { kind: 'not-a-project' } });
    expect(parseProjectFile('{"hello":1}')).toEqual({
      ok: false,
      error: { kind: 'not-a-project' },
    });
    expect(loadProject(null)).toEqual({ ok: false, error: { kind: 'not-a-project' } });
  });

  it('rechaza archivos de versiones más nuevas', () => {
    const doc = { ...clone(createBench().project), schemaVersion: 99 };
    expect(loadProject(doc)).toEqual({
      ok: false,
      error: { kind: 'newer-version', fileVersion: 99 },
    });
  });

  it('informa errores de esquema con su ruta', () => {
    const doc = clone(benchWithRoom().project);
    doc.levels[0]!.walls[0]!.thickness = -5;
    const result = loadProject(doc);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'schema') {
      expect(result.error.issues[0]!.path).toEqual(['levels', 0, 'walls', 0, 'thickness']);
    } else {
      throw new Error('se esperaba error de esquema');
    }
  });

  it('informa errores de integridad', () => {
    const doc = clone(benchWithRoom().project);
    doc.levels[0]!.walls[1]!.id = doc.levels[0]!.walls[0]!.id;
    const result = loadProject(doc);
    expect(!result.ok && result.error.kind).toBe('integrity');
  });
});

describe('migraciones', () => {
  const v1 = () => clone(createBench().project) as unknown as Record<string, unknown>;

  it('aplica migraciones en cadena hasta la versión objetivo', () => {
    const migrations: Migration[] = [
      { from: 1, migrate: (d) => ({ ...d, a: true }) },
      { from: 2, migrate: (d) => ({ ...d, b: d.a }) },
    ];
    const out = migrateDocument(v1(), migrations, 3);
    expect(out.ok && out.doc).toMatchObject({ schemaVersion: 3, a: true, b: true });
    expect(out.ok && out.fromVersion).toBe(1);
  });

  it('detecta migraciones faltantes y versiones ausentes', () => {
    expect(migrateDocument(v1(), [], 2)).toEqual({
      ok: false,
      reason: 'missing-migration',
      fromVersion: 1,
    });
    expect(migrateDocument({ schemaVersion: '1' }, [])).toEqual({
      ok: false,
      reason: 'missing-version',
    });
    expect(migrateDocument({ schemaVersion: 0 }, [])).toEqual({
      ok: false,
      reason: 'missing-version',
    });
  });
});

describe('integridad', () => {
  it('detecta referencias rotas y geometría inválida', () => {
    const bench = createBench();
    bench.run(createRoomFromPath, {
      levelId: bench.levelId,
      name: 'R',
      origin: { x: 0, y: 0 },
      segments: [
        { length: 3000, turn: 90 },
        { length: 3000, turn: 90 },
        { length: 3000, turn: 90 },
      ],
      height: 2400,
      thickness: 150,
    });
    const doc = clone(bench.project);
    const level = doc.levels[0]!;
    level.walls[0]!.finish = { left: 'mat_x' };
    level.walls.push({
      id: 'wall_bad',
      start: level.nodes[0]!.id,
      end: level.nodes[0]!.id,
      thickness: 100,
      height: 2400,
    });
    level.walls.push({
      id: 'wall_ghost',
      start: 'node_zz',
      end: level.nodes[0]!.id,
      thickness: 100,
      height: 2400,
    });
    level.walls.push({
      id: 'wall_short',
      start: level.nodes[0]!.id,
      end: 'node_close',
      thickness: 100,
      height: 2400,
    });
    level.nodes.push({ id: 'node_close', x: level.nodes[0]!.x + 1, y: level.nodes[0]!.y });
    level.openings.push({
      id: 'open_1',
      wallId: 'wall_none',
      def: 'door.single@1',
      offset: 0,
      params: {},
    });
    level.rooms.push({
      id: 'room_bad',
      name: 'B',
      boundary: [level.nodes[0]!.id, level.nodes[2]!.id, 'node_missing'],
    });
    level.rooms.push({
      id: 'room_gap',
      name: 'G',
      boundary: [level.nodes[0]!.id, level.nodes[2]!.id, 'node_close'],
    });
    level.rooms[0]!.floor = 'mat_floor';
    level.items.push({
      id: 'item_1',
      def: 'furniture.table@1',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      params: {},
      materials: { top: 'mat_y' },
    });
    const codes = new Set(checkIntegrity(doc).map((i) => i.code));
    expect([...codes].sort()).toEqual(
      [
        'degenerate-wall',
        'missing-material',
        'missing-node',
        'missing-room-edge',
        'missing-wall',
        'wall-too-short',
      ].sort(),
    );
  });

  it('detecta polígonos de recinto cruzados', () => {
    const doc = clone(benchWithRoom().project);
    const room = doc.levels[0]!.rooms[0]!;
    const [a, b, c, d] = room.boundary as [string, string, string, string];
    room.boundary = [a, c, b, d];
    const codes = checkIntegrity(doc).map((i) => i.code);
    expect(codes).toContain('invalid-room-polygon');
  });
});
