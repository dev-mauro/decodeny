import { describe, expect, it } from 'vitest';
import { renameProject } from '../commands/project';
import { createRectangularRoom, setRoomWallHeight } from '../commands/rooms';
import { createBench } from '../test-utils/fixtures';
import {
  COALESCE_WINDOW_MS,
  EMPTY_HISTORY,
  executeCommand,
  recordEntry,
  redo,
  undo,
  type HistoryState,
} from './history';

describe('historial', () => {
  const setup = () => {
    const bench = createBench();
    let project = bench.project;
    let history: HistoryState = EMPTY_HISTORY;
    const exec = <A, R>(
      cmd: Parameters<typeof executeCommand<A, R>>[1],
      args: A,
      at: number,
      key?: string,
    ) => {
      const out = executeCommand(project, cmd, args, { ids: bench.ids });
      project = out.project;
      history = recordEntry(history, {
        type: cmd.type,
        patches: out.patches,
        inverse: out.inverse,
        at,
        ...(key ? { coalesceKey: key } : {}),
      });
      return out.result;
    };
    return {
      bench,
      exec,
      get project() {
        return project;
      },
      set project(p) {
        project = p;
      },
      get history() {
        return history;
      },
      set history(h) {
        history = h;
      },
    };
  };

  it('deshace y rehace comandos', () => {
    const s = setup();
    const initial = s.project;
    s.exec(renameProject, { name: 'A' }, 0);
    s.exec(renameProject, { name: 'B' }, 5000);
    expect(s.history.past).toHaveLength(2);

    const u1 = undo(s.project, s.history)!;
    expect(u1.project.meta.name).toBe('A');
    const u2 = undo(u1.project, u1.history)!;
    expect(u2.project).toEqual(initial);
    expect(undo(u2.project, u2.history)).toBeNull();

    const r1 = redo(u2.project, u2.history)!;
    expect(r1.project.meta.name).toBe('A');
    const r2 = redo(r1.project, r1.history)!;
    expect(r2.project.meta.name).toBe('B');
    expect(redo(r2.project, r2.history)).toBeNull();
  });

  it('un comando nuevo descarta el futuro', () => {
    const s = setup();
    s.exec(renameProject, { name: 'A' }, 0);
    const u = undo(s.project, s.history)!;
    s.project = u.project;
    s.history = u.history;
    expect(s.history.future).toHaveLength(1);
    s.exec(renameProject, { name: 'C' }, 10);
    expect(s.history.future).toHaveLength(0);
  });

  it('fusiona ediciones consecutivas con la misma clave dentro de la ventana', () => {
    const s = setup();
    const { roomId } = s.exec(
      createRectangularRoom,
      {
        levelId: s.bench.levelId,
        name: 'R',
        origin: { x: 0, y: 0 },
        width: 3000,
        depth: 3000,
        height: 2400,
        thickness: 150,
      },
      0,
    );
    const ref = { levelId: s.bench.levelId, roomId };
    s.exec(setRoomWallHeight, { ...ref, height: 2500 }, 5000, 'h');
    s.exec(setRoomWallHeight, { ...ref, height: 2600 }, 5000 + COALESCE_WINDOW_MS / 2, 'h');
    s.exec(setRoomWallHeight, { ...ref, height: 2700 }, 5000 + COALESCE_WINDOW_MS, 'h');
    expect(s.history.past).toHaveLength(2);
    const u = undo(s.project, s.history)!;
    expect(u.project.levels[0]!.walls[0]!.height).toBe(2400);
  });

  it('no registra comandos sin cambios y respeta el límite', () => {
    const s = setup();
    s.exec(renameProject, { name: s.project.meta.name }, 0);
    expect(s.history.past).toHaveLength(0);
    let h: HistoryState = EMPTY_HISTORY;
    for (let i = 0; i < 5; i++) {
      h = recordEntry(
        h,
        {
          type: 't',
          patches: [{ op: 'replace', path: ['x'], value: i }],
          inverse: [],
          at: i * 10_000,
        },
        3,
      );
    }
    expect(h.past).toHaveLength(3);
  });

  it('un comando que falla no cambia el documento', () => {
    const s = setup();
    const before = s.project;
    expect(() => s.exec(renameProject, { name: '' }, 0)).toThrow();
    expect(s.project).toBe(before);
    expect(s.history.past).toHaveLength(0);
  });
});
