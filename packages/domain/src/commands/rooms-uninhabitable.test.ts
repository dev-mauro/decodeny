import { describe, expect, it } from 'vitest';
import { parseProjectFile, serializeProject } from '../io/project-file';
import { benchWithRoom } from '../test-utils/fixtures';
import { setRoomUninhabitable } from './rooms';

describe('espacio no habitable', () => {
  it('se marca, se guarda en el archivo y se desmarca', () => {
    const bench = benchWithRoom();
    const roomId = bench.project.levels[0]!.rooms[0]!.id;
    bench.run(setRoomUninhabitable, { levelId: bench.levelId, roomId, uninhabitable: true });
    expect(bench.project.levels[0]!.rooms[0]!.uninhabitable).toBe(true);

    const parsed = parseProjectFile(serializeProject(bench.project));
    expect(parsed.ok && parsed.project.levels[0]!.rooms[0]!.uninhabitable).toBe(true);

    bench.run(setRoomUninhabitable, { levelId: bench.levelId, roomId, uninhabitable: false });
    expect('uninhabitable' in bench.project.levels[0]!.rooms[0]!).toBe(false);
  });
});
