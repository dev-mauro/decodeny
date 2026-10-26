import type { Command } from '../commands/command';
import { createRectangularRoom } from '../commands/rooms';
import { executeCommand } from '../history/history';
import { sequentialIds, type IdFactory } from '../ids';
import { createEmptyProject } from '../model/factory';
import type { Project } from '../model/types';

export const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

export interface TestBench {
  project: Project;
  readonly ids: IdFactory;
  readonly levelId: string;
  run<A, R>(command: Command<A, R>, args: A): R;
}

/** Proyecto determinista con un helper para aplicar comandos en cadena. */
export function createBench(): TestBench {
  const ids = sequentialIds();
  const project = createEmptyProject({
    name: 'Proyecto de prueba',
    levelName: 'Piso 1',
    generator: 'decodeny@test',
    ids,
    now: FIXED_NOW,
  });
  const bench: TestBench = {
    project,
    ids,
    levelId: project.levels[0]!.id,
    run(command, args) {
      const out = executeCommand(bench.project, command, args, { ids });
      bench.project = out.project;
      return out.result;
    },
  };
  return bench;
}

/** Recinto interior de 4,00 × 3,00 m con muros de 150 mm y 2,40 m de alto en el origen. */
export function benchWithRoom(): TestBench & { roomId: string } {
  const bench = createBench();
  const { roomId } = bench.run(createRectangularRoom, {
    levelId: bench.levelId,
    name: 'Living',
    origin: { x: 0, y: 0 },
    width: 4000,
    depth: 3000,
    height: 2400,
    thickness: 150,
  });
  return Object.assign(bench, { roomId });
}
