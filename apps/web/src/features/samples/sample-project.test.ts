import { itemBase, itemEnvelope } from '@decodeny/catalog';
import {
  checkIntegrity,
  itemWarnings,
  roomMetrics,
  roomOfItem,
  roomsOfWall,
} from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { buildSampleProject } from './sample-project';

describe('proyecto de ejemplo', () => {
  const project = buildSampleProject();
  const level = project.levels[0]!;

  it('es íntegro y conserva sus superficies', () => {
    expect(checkIntegrity(project)).toEqual([]);
    const total = level.rooms.reduce((sum, r) => sum + roomMetrics(level, r).area, 0);
    expect(total / 1e6).toBeCloseTo(50.58, 2);
  });

  it('los recintos adosados comparten tabiques', () => {
    const shared = level.walls.filter((w) => roomsOfWall(level, w.id).length === 2);
    expect(shared.length).toBeGreaterThanOrEqual(6);
  });

  it('incluye puertas interiores, acceso y ventanas', () => {
    const doors = level.openings.filter((o) => o.def.startsWith('door.'));
    const windows = level.openings.filter((o) => o.def.startsWith('window.'));
    expect(doors).toHaveLength(5);
    expect(windows).toHaveLength(5);
  });

  it('está amoblado sin superposiciones ni muebles atravesando muros', () => {
    expect(level.items.length).toBeGreaterThanOrEqual(30);
    expect([...itemWarnings(level, itemEnvelope, (i) => itemBase(level, i))]).toEqual([]);
    for (const item of level.items) expect(roomOfItem(level, item)).toBeDefined();
  });
});
