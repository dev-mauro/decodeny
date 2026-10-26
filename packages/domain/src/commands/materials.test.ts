import { describe, expect, it } from 'vitest';
import { colorParam, lengthParam } from '../catalog/params';
import { defineMaterial, resolveMaterial } from '../catalog/material-definition';
import { DomainError } from '../errors';
import { checkIntegrity } from '../model/integrity';
import {
  materialOfSurface,
  materialUsage,
  projectColors,
  roomWallTargets,
} from '../model/materials';
import { requireLevel, requireRoom } from '../model/queries';
import { benchWithRoom, type TestBench } from '../test-utils/fixtures';
import { applyMaterial, clearMaterial, detachMaterial, updateMaterial } from './materials';
import { createRectangularRoom, moveRoom } from './rooms';

const level = (bench: TestBench) => requireLevel(bench.project, bench.levelId);

describe('terminaciones', () => {
  it('pinta todos los muros interiores de un recinto con una sola instancia', () => {
    const bench = benchWithRoom();
    const targets = roomWallTargets(level(bench), requireRoom(level(bench), bench.roomId));
    expect(targets).toHaveLength(4);
    const { materialId } = bench.run(applyMaterial, {
      levelId: bench.levelId,
      targets,
      material: { def: 'wall.paint-matte@1', tint: '#A0C4FF' },
    });
    expect(bench.project.materials).toEqual([
      { id: materialId, def: 'wall.paint-matte@1', tint: '#a0c4ff' },
    ]);
    for (const t of targets) expect(materialOfSurface(level(bench), t)).toBe(materialId);
    expect(materialUsage(bench.project).get(materialId)).toBe(4);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('cambiar la instancia afecta a todas sus superficies; independizar a una sola', () => {
    const bench = benchWithRoom();
    const targets = roomWallTargets(level(bench), requireRoom(level(bench), bench.roomId));
    const { materialId } = bench.run(applyMaterial, {
      levelId: bench.levelId,
      targets,
      material: { def: 'wall.paint-matte@1' },
    });
    bench.run(updateMaterial, { materialId, tint: '#112233', scale: 2, rotation: -90 });
    expect(bench.project.materials[0]).toMatchObject({ tint: '#112233', scale: 2, rotation: 270 });

    const { materialId: copy } = bench.run(detachMaterial, {
      levelId: bench.levelId,
      target: targets[0]!,
    });
    expect(copy).not.toBe(materialId);
    expect(materialOfSurface(level(bench), targets[0]!)).toBe(copy);
    expect(materialOfSurface(level(bench), targets[1]!)).toBe(materialId);
    expect(bench.project.materials).toHaveLength(2);
  });

  it('el cuentagotas comparte una instancia existente y se limpian las huérfanas', () => {
    const bench = benchWithRoom();
    const floor = { kind: 'floor', roomId: bench.roomId } as const;
    const ceiling = { kind: 'ceiling', roomId: bench.roomId } as const;
    const { materialId: oak } = bench.run(applyMaterial, {
      levelId: bench.levelId,
      targets: [floor],
      material: { def: 'floor.oak@1', params: { plankWidth: 180 } },
    });
    bench.run(applyMaterial, {
      levelId: bench.levelId,
      targets: [ceiling],
      material: { def: 'ceiling.paint@1' },
    });
    // El cielo pasa a usar la misma instancia que el piso: la de pintura queda huérfana.
    bench.run(applyMaterial, {
      levelId: bench.levelId,
      targets: [ceiling],
      material: { materialId: oak },
    });
    expect(bench.project.materials.map((m) => m.id)).toEqual([oak]);
    bench.run(clearMaterial, { levelId: bench.levelId, targets: [floor, ceiling] });
    expect(bench.project.materials).toEqual([]);
    expect(materialOfSurface(level(bench), floor)).toBeNull();
  });

  it('las instancias con nombre se conservan como paleta del proyecto', () => {
    const bench = benchWithRoom();
    const floor = { kind: 'floor', roomId: bench.roomId } as const;
    const { materialId } = bench.run(applyMaterial, {
      levelId: bench.levelId,
      targets: [floor],
      material: { def: 'floor.oak@1', name: 'Roble living', tint: '#aa8855' },
    });
    bench.run(clearMaterial, { levelId: bench.levelId, targets: [floor] });
    expect(bench.project.materials.map((m) => m.id)).toEqual([materialId]);
    expect(projectColors(bench.project)).toEqual(['#aa8855']);
  });

  it('valida colores, escalas y referencias', () => {
    const bench = benchWithRoom();
    const floor = { kind: 'floor', roomId: bench.roomId } as const;
    const apply = (material: Parameters<typeof applyMaterial.run>[1]['material']) =>
      bench.run(applyMaterial, { levelId: bench.levelId, targets: [floor], material });
    expect(() => apply({ def: 'roble' })).toThrow(DomainError);
    expect(() => apply({ def: 'floor.oak@1', tint: 'rojo' })).toThrow(DomainError);
    expect(() => apply({ def: 'floor.oak@1', scale: 0 })).toThrow(DomainError);
    expect(() => apply({ materialId: 'mat_x' })).toThrow(DomainError);
  });

  it('las terminaciones sobreviven a compartir y separar muros', () => {
    const bench = benchWithRoom();
    const targets = roomWallTargets(level(bench), requireRoom(level(bench), bench.roomId));
    const { materialId } = bench.run(applyMaterial, {
      levelId: bench.levelId,
      targets,
      material: { def: 'wall.paint-matte@1' },
    });
    // Un vecino adosado divide el muro este; al alejarlo, el muro se vuelve a unir.
    const { roomId } = bench.run(createRectangularRoom, {
      levelId: bench.levelId,
      name: 'B',
      origin: { x: 4150, y: 1000 },
      width: 2000,
      depth: 1000,
      height: 2400,
      thickness: 150,
    });
    bench.run(moveRoom, { levelId: bench.levelId, roomId, dx: 3000, dy: 0 });
    const room = requireRoom(level(bench), bench.roomId);
    expect(room.boundary).toHaveLength(4);
    for (const t of roomWallTargets(level(bench), room)) {
      expect(materialOfSurface(level(bench), t)).toBe(materialId);
    }
    expect(checkIntegrity(bench.project)).toEqual([]);
  });
});

describe('definiciones de material', () => {
  const tile = defineMaterial({
    id: 'floor.tile@1',
    name: { es: 'Cerámica' },
    category: 'tile',
    surfaces: ['floor', 'wall'],
    pattern: 'tiles',
    color: '#eeeeee',
    tintable: true,
    roughness: 0.3,
    params: {
      size: lengthParam({ default: 600, min: 50, max: 1200, label: { es: 'Tamaño' } }),
      grout: colorParam({ default: '#cccccc', label: { es: 'Fragüe' } }),
    },
  });

  it('resuelve color, parámetros, escala y rotación de una instancia', () => {
    expect(resolveMaterial(tile)).toMatchObject({
      color: '#eeeeee',
      params: { size: 600, grout: '#cccccc' },
      scale: 1,
      rotation: 0,
    });
    expect(
      resolveMaterial(tile, { tint: '#123456', params: { size: 300, grout: 'nope' }, scale: 2 }),
    ).toMatchObject({ color: '#123456', params: { size: 300, grout: '#cccccc' }, scale: 2 });
    expect(resolveMaterial({ ...tile, tintable: false }, { tint: '#123456' }).color).toBe(
      '#eeeeee',
    );
  });
});
