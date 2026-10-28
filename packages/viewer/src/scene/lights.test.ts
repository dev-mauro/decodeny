import {
  addItem,
  createEmptyProject,
  createRectangularRoom,
  executeCommand,
  sequentialIds,
  type Project,
} from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { kelvinToColor, lampLights, lightBudget } from './lamp-lights';

function roomWithLamp(def: string, params: Record<string, number | boolean>, count = 1): Project {
  const ids = sequentialIds();
  let project = createEmptyProject({ name: 'P', levelName: 'L', generator: 't', ids });
  const levelId = project.levels[0]!.id;
  project = executeCommand(
    project,
    createRectangularRoom,
    {
      levelId,
      name: 'R',
      origin: { x: 0, y: 0 },
      width: 4000,
      depth: 3000,
      height: 2600,
      thickness: 150,
    },
    { ids },
  ).project;
  for (let i = 0; i < count; i++) {
    project = executeCommand(
      project,
      addItem,
      { levelId, def, params, position: { x: 2000, y: 1500 } },
      { ids },
    ).project;
  }
  return project;
}

describe('luces de luminarias', () => {
  it('un colgante cuelga del cielo de su recinto', () => {
    const project = roomWithLamp('light.pendant@1', { diameter: 350, height: 800 });
    const [light] = lampLights(project.levels[0]!);
    // Cielo a 2,60 m; el colgante mide 0,80 m y su ampolleta está a 6 cm de su base.
    expect(light!.position[1]).toBeCloseTo(2.6 - 0.8 + 0.06, 6);
    expect(light!.position[0]).toBeCloseTo(2, 6);
    expect(light!.position[2]).toBeCloseTo(-1.5, 6);
  });

  it('el flujo luminoso define la intensidad y apagar elimina la luz', () => {
    const dim = lampLights(roomWithLamp('light.ceiling@1', { lumens: 500 }).levels[0]!)[0]!;
    const bright = lampLights(roomWithLamp('light.ceiling@1', { lumens: 2000 }).levels[0]!)[0]!;
    expect(bright.intensity / dim.intensity).toBeCloseTo(4, 6);
    expect(lampLights(roomWithLamp('light.ceiling@1', { on: false }).levels[0]!)).toEqual([]);
  });

  it('limita la cantidad de luces simultáneas', () => {
    const project = roomWithLamp('light.recessed@1', {}, 20);
    expect(lightBudget(lampLights(project.levels[0]!), [0, 1.6, 0], 12)).toHaveLength(12);
  });

  it('enciende las más cercanas a la cámara y solo las más próximas proyectan sombra', () => {
    const at = (key: string, x: number) => ({
      key,
      position: [x, 2.4, 0] as [number, number, number],
      intensity: 1,
      color: kelvinToColor(3000),
    });
    const lights = [at('far', 9), at('near', 1), at('mid', 4), at('farther', 20)];
    const budget = lightBudget(lights, [0, 1.6, 0], 3, 2);
    expect(budget.map((l) => l.key)).toEqual(['near', 'mid', 'far']);
    expect(budget.map((l) => l.castShadow)).toEqual([true, true, false]);
    expect(lightBudget(lights, [20, 1.6, 0], 3, 0).every((l) => !l.castShadow)).toBe(true);
  });

  it('una luz encendida no se cambia por otra apenas más cercana (no alternan)', () => {
    const at = (key: string, x: number) => ({
      key,
      position: [x, 2.4, 0] as [number, number, number],
      intensity: 1,
      color: kelvinToColor(3000),
    });
    const lights = [at('a', 5), at('b', 5.8)];
    // Sin historia, gana la más cercana; si `b` ya estaba encendida, la conserva.
    expect(lightBudget(lights, [0, 1.6, 0], 1, 0).map((l) => l.key)).toEqual(['a']);
    expect(lightBudget(lights, [0, 1.6, 0], 1, 0, new Set(['b'])).map((l) => l.key)).toEqual(['b']);
    // Si la otra está claramente más cerca, se cambia igual.
    expect(lightBudget([at('a', 2), at('b', 6)], [0, 1.6, 0], 1, 0, new Set(['b']))[0]?.key).toBe(
      'a',
    );
  });

  it('la temperatura de color va de cálida a fría', () => {
    const warm = kelvinToColor(2700);
    const cold = kelvinToColor(6500);
    expect(warm.r).toBeGreaterThan(warm.b);
    expect(cold.b).toBeGreaterThan(warm.b);
  });
});
