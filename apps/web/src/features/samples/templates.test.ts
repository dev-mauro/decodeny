import { itemBase, itemEnvelope } from '@decodeny/catalog';
import {
  addWall,
  checkIntegrity,
  createId,
  executeCommand,
  itemWarnings,
  roomOfItem,
  roomsOfWall,
} from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { PROJECT_TEMPLATES } from './templates';

describe.each(PROJECT_TEMPLATES.map((t) => [t.id, t] as const))('plantilla %s', (_, template) => {
  const project = template.build();
  const level = project.levels[0]!;

  it('es íntegra, con tabiques compartidos y puertas', () => {
    expect(checkIntegrity(project)).toEqual([]);
    expect(level.walls.some((w) => roomsOfWall(level, w.id).length === 2)).toBe(true);
    expect(level.openings.some((o) => o.def.startsWith('door.'))).toBe(true);
  });

  it('sus muebles están dentro de recintos, sin superponerse ni atravesar muros', () => {
    expect(level.items.length).toBeGreaterThan(5);
    expect([...itemWarnings(level, itemEnvelope, (i) => itemBase(level, i))]).toEqual([]);
    for (const item of level.items) expect(roomOfItem(level, item)).toBeDefined();
  });
});

describe('plantilla 2d2b', () => {
  it('un muro cierra el hueco sobre el baño en suite (muros dobles) y crea un recinto', () => {
    const project = PROJECT_TEMPLATES.find((t) => t.id === '2d2b')!.build();
    const level = project.levels[0]!;
    // De la esquina del dormitorio principal al muro del baño 2.
    const out = executeCommand(
      project,
      addWall,
      { levelId: level.id, from: { x: 3475, y: 7425 }, to: { x: 5675, y: 7425 }, roomName: 'R' },
      { ids: createId },
    );
    expect(out.result.roomIds).toHaveLength(1);
    expect(out.project.levels[0]!.rooms).toHaveLength(level.rooms.length + 1);
    expect(checkIntegrity(out.project)).toEqual([]);
  });
});
