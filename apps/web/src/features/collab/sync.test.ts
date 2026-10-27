import {
  createEmptyProject,
  createRectangularRoom,
  deleteRoom,
  moveRoom,
  renameProject,
  sequentialIds,
  type Project,
} from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { createProjectStore, type ProjectStore } from '@/state/project-store';
import { GuestSync } from './guest-sync';
import { HostSync } from './host-sync';
import { HOST_ID, type GuestMessage, type HostMessage } from './protocol';

function initialProject(): Project {
  return createEmptyProject({
    name: 'Sesión',
    levelName: 'Piso 1',
    generator: 'decodeny@test',
    ids: sequentialIds(),
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
}

/**
 * Sesión en memoria con latencia controlada: los mensajes quedan en cola hasta `flush()` y pasan
 * por JSON, como por el canal real.
 */
function session(guestNames: readonly string[] = ['ana']) {
  const host = createProjectStore(initialProject());
  const queue: (() => void)[] = [];
  const wire = <T>(message: T): T => JSON.parse(JSON.stringify(message)) as T;
  const guests = new Map<string, { store: ProjectStore; sync: GuestSync }>();

  const hostSync = new HostSync(host, {
    broadcast: (message, except) => {
      for (const [id, guest] of guests) {
        if (id !== except) queue.push(() => guest.sync.handle(wire(message)));
      }
    },
    send: (id, message) => {
      const guest = guests.get(id);
      if (guest) queue.push(() => guest.sync.handle(wire(message)));
    },
  });
  hostSync.start();

  const rejected: string[] = [];
  for (const id of guestNames) {
    const store = createProjectStore(
      createEmptyProject({ name: 'Otro', levelName: 'X', generator: 'decodeny@test' }),
    );
    const sync = new GuestSync(
      store,
      (message: GuestMessage) => queue.push(() => hostSync.handle(id, wire(message))),
      { onRejected: (code) => rejected.push(code) },
      id,
    );
    guests.set(id, { store, sync });
    const you = { id, name: id, color: '#000000' };
    sync.handle(wire(hostSync.welcome(you, [])));
  }

  const flush = () => {
    while (queue.length > 0) queue.shift()!();
  };
  const guest = (id = 'ana') => guests.get(id)!;
  const levelId = host.getState().project.levels[0]!.id;
  return { host, hostSync, guest, flush, levelId, rejected };
}

const room = (levelId: string, name: string, x: number) => ({
  levelId,
  name,
  origin: { x, y: 0 },
  width: 3000,
  depth: 3000,
  height: 2400,
  thickness: 150,
});

describe('sincronización de la sesión', () => {
  it('el invitado recibe el documento del anfitrión al unirse', () => {
    const s = session();
    expect(s.guest().store.getState().project).toEqual(s.host.getState().project);
  });

  it('las operaciones del invitado se ven al instante y convergen en el anfitrión', () => {
    const s = session();
    const out = s
      .guest()
      .store.getState()
      .dispatch(createRectangularRoom, room(s.levelId, 'A', 0));
    expect(out.ok).toBe(true);
    // Optimista: se ve antes de que el anfitrión responda.
    expect(s.guest().store.getState().project.levels[0]!.rooms).toHaveLength(1);
    expect(s.host.getState().project.levels[0]!.rooms).toHaveLength(0);
    s.flush();
    expect(s.host.getState().project).toEqual(s.guest().store.getState().project);
    // Mismos ids en ambos: el id devuelto al invitado sirve en el anfitrión.
    const roomId = out.ok ? out.result.roomId : '';
    expect(s.host.getState().project.levels[0]!.rooms[0]!.id).toBe(roomId);
    expect(s.guest().sync.pendingCount).toBe(0);
  });

  it('las operaciones concurrentes convergen al orden del anfitrión', () => {
    const s = session(['ana', 'bob']);
    s.guest('ana')
      .store.getState()
      .dispatch(createRectangularRoom, room(s.levelId, 'A', 0));
    s.guest('bob')
      .store.getState()
      .dispatch(createRectangularRoom, room(s.levelId, 'B', 8000));
    s.host.getState().dispatch(renameProject, { name: 'Casa' });
    s.host.getState().dispatch(createRectangularRoom, room(s.levelId, 'H', 16000));
    s.flush();
    const expected = s.host.getState().project;
    expect(expected.levels[0]!.rooms.map((r) => r.name).sort()).toEqual(['A', 'B', 'H']);
    expect(expected.meta.name).toBe('Casa');
    expect(s.guest('ana').store.getState().project).toEqual(expected);
    expect(s.guest('bob').store.getState().project).toEqual(expected);
  });

  it('una operación que ya no aplica se rechaza y el invitado vuelve al documento del anfitrión', () => {
    const s = session();
    const created = s.host.getState().dispatch(createRectangularRoom, room(s.levelId, 'A', 0));
    s.flush();
    const roomId = created.ok ? created.result.roomId : '';
    // El invitado mueve el espacio mientras el anfitrión lo borra.
    s.guest().store.getState().dispatch(moveRoom, { levelId: s.levelId, roomId, dx: 500, dy: 0 });
    s.host.getState().dispatch(deleteRoom, { levelId: s.levelId, roomId });
    s.flush();
    expect(s.host.getState().project.levels[0]!.rooms).toHaveLength(0);
    expect(s.guest().store.getState().project).toEqual(s.host.getState().project);
    expect(s.guest().sync.pendingCount).toBe(0);
    expect(s.rejected).toHaveLength(1);
  });

  it('deshacer y rehacer son de la sesión', () => {
    const s = session();
    const guest = s.guest().store;
    expect(guest.getState().sharedHistory).toEqual({ canUndo: false, canRedo: false });
    guest.getState().dispatch(renameProject, { name: 'Del invitado' });
    s.flush();
    expect(guest.getState().sharedHistory?.canUndo).toBe(true);
    // El invitado no lleva historial propio.
    expect(guest.getState().history.past).toHaveLength(0);
    guest.getState().undo();
    s.flush();
    expect(s.host.getState().project.meta.name).toBe('Sesión');
    expect(guest.getState().project).toEqual(s.host.getState().project);
    expect(guest.getState().sharedHistory).toEqual({ canUndo: false, canRedo: true });
    s.host.getState().redo();
    s.flush();
    expect(guest.getState().project.meta.name).toBe('Del invitado');
  });

  it('una vista previa en curso se rehace sobre los cambios que llegan', () => {
    const s = session();
    const created = s.host.getState().dispatch(createRectangularRoom, room(s.levelId, 'A', 0));
    s.flush();
    const roomId = created.ok ? created.result.roomId : '';
    const guest = s.guest().store;
    // El invitado arrastra el espacio mientras el anfitrión renombra el proyecto.
    guest.getState().preview(moveRoom, { levelId: s.levelId, roomId, dx: 1000, dy: 0 });
    s.host.getState().dispatch(renameProject, { name: 'Casa' });
    s.flush();
    expect(guest.getState().project.meta.name).toBe('Casa');
    expect(guest.getState().transaction).not.toBeNull();
    // El anfitrión no ve el arrastre hasta que se suelta.
    const hostNode = () => s.host.getState().project.levels[0]!.nodes[0]!;
    const before = hostNode();
    guest.getState().commitPreview();
    s.flush();
    expect(hostNode()).not.toEqual(before);
    expect(guest.getState().project).toEqual(s.host.getState().project);
  });

  it('el anfitrión recibe operaciones mientras arrastra, y la bienvenida no incluye su arrastre', () => {
    const s = session();
    const created = s.host.getState().dispatch(createRectangularRoom, room(s.levelId, 'A', 0));
    s.flush();
    const roomId = created.ok ? created.result.roomId : '';
    s.host.getState().preview(moveRoom, { levelId: s.levelId, roomId, dx: 0, dy: 700 });
    expect(s.hostSync.welcome({ id: 'x', name: 'x', color: '#000' }, []).t).toBe('welcome');
    const welcome = s.hostSync.welcome({ id: 'x', name: 'x', color: '#000' }, []);
    expect(welcome.t === 'welcome' && welcome.project).toEqual(s.guest().store.getState().project);
    s.guest().store.getState().dispatch(renameProject, { name: 'Casa' });
    s.flush();
    expect(s.host.getState().project.meta.name).toBe('Casa');
    expect(s.host.getState().transaction).not.toBeNull();
    s.host.getState().commitPreview();
    s.flush();
    expect(s.guest().store.getState().project).toEqual(s.host.getState().project);
    expect(s.host.getState().history.past.map((e) => e.type)).toEqual([
      'room.createRectangular',
      'project.rename',
      'room.move',
    ]);
  });

  it('las operaciones del anfitrión llevan su autoría y un comando desconocido se rechaza', () => {
    const s = session();
    const seen: HostMessage[] = [];
    const sync = new HostSync(s.host, {
      broadcast: (m) => seen.push(m),
      send: (_, m) => seen.push(m),
    });
    sync.start();
    s.host.getState().dispatch(renameProject, { name: 'Casa' });
    sync.handle('ana', { t: 'op', opId: 'x', op: { type: 'nada', args: {}, ids: [] } });
    sync.handle('ana', { t: 'op', opId: 'y', op: { type: 'project.rename', args: null, ids: [] } });
    expect(seen.map((m) => m.t)).toEqual(['applied', 'rejected', 'rejected']);
    expect(seen[0]!.t === 'applied' && seen[0]!.author).toBe(HOST_ID);
  });
});
