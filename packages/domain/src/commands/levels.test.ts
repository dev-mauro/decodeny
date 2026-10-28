import { describe, expect, it } from 'vitest';
import { benchWithRoom } from '../test-utils/fixtures';
import { checkIntegrity } from '../model/integrity';
import {
  addLevel,
  duplicateLevel,
  levelAbove,
  levelBelow,
  nextLevelElevation,
  removeLevel,
  renameLevel,
  setLevelElevation,
  SLAB_THICKNESS,
  storeyRise,
} from './levels';

describe('plantas', () => {
  it('una planta nueva va sobre la más alta: su muro más alto más la losa', () => {
    const bench = benchWithRoom();
    expect(nextLevelElevation(bench.project)).toBe(2400 + SLAB_THICKNESS);
    const { levelId } = bench.run(addLevel, { name: 'Piso 2' });
    const level = bench.project.levels.find((l) => l.id === levelId)!;
    expect(level).toMatchObject({ name: 'Piso 2', elevation: 2600, walls: [], rooms: [] });
    expect(levelAbove(bench.project, bench.levelId)?.id).toBe(levelId);
    expect(levelBelow(bench.project, levelId)?.id).toBe(bench.levelId);
  });

  it('copia el contorno de otra planta con ids nuevos, sin vanos ni muebles', () => {
    const bench = benchWithRoom();
    const { levelId } = bench.run(addLevel, { name: 'Piso 2', copyOutlineFrom: bench.levelId });
    const [ground, upper] = bench.project.levels;
    expect(upper!.id).toBe(levelId);
    expect(upper!.walls).toHaveLength(ground!.walls.length);
    expect(upper!.rooms).toHaveLength(1);
    expect(upper!.walls.some((w) => ground!.walls.some((g) => g.id === w.id))).toBe(false);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('duplicar copia todo y se ubica arriba; se renombra y se elimina', () => {
    const bench = benchWithRoom();
    const { levelId } = bench.run(duplicateLevel, { levelId: bench.levelId, name: 'Piso 2' });
    expect(bench.project.levels.map((l) => l.id)).toEqual([bench.levelId, levelId]);
    bench.run(renameLevel, { levelId, name: 'Altillo' });
    expect(bench.project.levels[1]!.name).toBe('Altillo');
    bench.run(removeLevel, { levelId });
    expect(bench.project.levels).toHaveLength(1);
  });

  it('se mantienen ordenadas por altura (un subterráneo queda primero)', () => {
    const bench = benchWithRoom();
    const { levelId } = bench.run(addLevel, { name: 'Subterráneo', elevation: -2800 });
    expect(bench.project.levels[0]!.id).toBe(levelId);
    bench.run(setLevelElevation, { levelId, elevation: 5200 });
    expect(bench.project.levels[1]!.id).toBe(levelId);
  });

  it('siempre queda al menos una planta', () => {
    const bench = benchWithRoom();
    expect(() => bench.run(removeLevel, { levelId: bench.levelId })).toThrow();
  });

  it('de piso a piso: hasta la planta de arriba o varias más arriba', () => {
    const bench = benchWithRoom();
    expect(storeyRise(bench.project, bench.levelId)).toBe(2600);
    bench.run(addLevel, { name: 'Piso 2' });
    bench.run(addLevel, { name: 'Piso 3', elevation: 5800 });
    expect(storeyRise(bench.project, bench.levelId)).toBe(2600);
    expect(storeyRise(bench.project, bench.levelId, 2)).toBe(5800);
    // Si faltan plantas arriba, cuentan con la altura de la última.
    expect(storeyRise(bench.project, bench.levelId, 3)).toBe(5800 + 2600);
  });
});
