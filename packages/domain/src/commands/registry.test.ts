import { describe, expect, it } from 'vitest';
import { executeCommand } from '../history/history';
import { recordingIds, replayIds } from '../ids';
import { createBench } from '../test-utils/fixtures';
import * as all from './index';
import { COMMANDS, commandByType } from './registry';
import { createRectangularRoom } from './rooms';

describe('registro de comandos', () => {
  it('incluye cada comando exportado, una vez por tipo', () => {
    const exported = (Object.values(all) as unknown[]).filter(
      (v): v is { type: string; run: unknown } =>
        typeof v === 'object' && v !== null && 'type' in v && 'run' in v,
    );
    expect(exported.length).toBeGreaterThan(20);
    for (const command of exported) expect(commandByType(command.type)).toBe(command);
    expect(COMMANDS.size).toBe(new Set(exported.map((c) => c.type)).size);
  });

  it('con los ids anotados, otra ejecución da exactamente el mismo documento', () => {
    const bench = createBench();
    const args = {
      levelId: bench.levelId,
      name: 'Living',
      origin: { x: 0, y: 0 },
      width: 4000,
      depth: 3000,
      height: 2400,
      thickness: 150,
    };
    const recording = recordingIds();
    const a = executeCommand(bench.project, createRectangularRoom, args, { ids: recording.ids });
    const command = commandByType('room.createRectangular')!;
    const b = executeCommand(bench.project, command, args, { ids: replayIds(recording.recorded) });
    expect(b.project).toEqual(a.project);
    expect(recording.recorded.length).toBeGreaterThan(5);
  });
});
