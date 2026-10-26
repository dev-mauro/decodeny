import { distance, isSimplePolygon } from '../geometry';
import { isDomainError } from '../errors';
import { assertOpeningFits } from './openings';
import { levelWallFootprints, nodePositions, roomEdges } from './queries';
import { WALL_LIMITS } from './schema';
import type { Project } from './types';

export type IntegrityCode =
  | 'duplicate-id'
  | 'missing-node'
  | 'degenerate-wall'
  | 'wall-too-short'
  | 'missing-wall'
  | 'missing-room-edge'
  | 'invalid-room-polygon'
  | 'invalid-opening'
  | 'missing-material';

export interface IntegrityIssue {
  readonly code: IntegrityCode;
  readonly path: readonly (string | number)[];
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * Reglas que el esquema estructural (Zod) no puede expresar: unicidad de ids,
 * referencias entre entidades y validez geométrica.
 */
export function checkIntegrity(project: Project): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const seen = new Set<string>();
  const checkId = (id: string, path: (string | number)[]) => {
    if (seen.has(id)) issues.push({ code: 'duplicate-id', path, params: { id } });
    seen.add(id);
  };
  const materialIds = new Set(project.materials.map((m) => m.id));
  const checkMaterial = (id: string | undefined, path: (string | number)[]) => {
    if (id !== undefined && !materialIds.has(id)) {
      issues.push({ code: 'missing-material', path, params: { id } });
    }
  };

  project.materials.forEach((m, i) => checkId(m.id, ['materials', i, 'id']));
  project.assets.forEach((a, i) => checkId(a.id, ['assets', i, 'id']));

  project.levels.forEach((level, li) => {
    const base = ['levels', li] as const;
    checkId(level.id, [...base, 'id']);
    level.nodes.forEach((n, i) => checkId(n.id, [...base, 'nodes', i, 'id']));
    const positions = nodePositions(level);
    const wallIds = new Set<string>();

    level.walls.forEach((wall, i) => {
      const path = [...base, 'walls', i];
      checkId(wall.id, [...path, 'id']);
      wallIds.add(wall.id);
      const a = positions.get(wall.start);
      const b = positions.get(wall.end);
      if (!a)
        issues.push({ code: 'missing-node', path: [...path, 'start'], params: { id: wall.start } });
      if (!b)
        issues.push({ code: 'missing-node', path: [...path, 'end'], params: { id: wall.end } });
      if (wall.start === wall.end) {
        issues.push({ code: 'degenerate-wall', path, params: { id: wall.id } });
      } else if (a && b && distance(a, b) < WALL_LIMITS.length.min) {
        issues.push({
          code: 'wall-too-short',
          path,
          params: { id: wall.id, min: WALL_LIMITS.length.min },
        });
      }
      checkMaterial(wall.finish?.left, [...path, 'finish', 'left']);
      checkMaterial(wall.finish?.right, [...path, 'finish', 'right']);
    });

    const footprints = level.openings.length > 0 ? levelWallFootprints(level) : new Map();
    level.openings.forEach((o, i) => {
      checkId(o.id, [...base, 'openings', i, 'id']);
      if (!wallIds.has(o.wallId)) {
        issues.push({
          code: 'missing-wall',
          path: [...base, 'openings', i, 'wallId'],
          params: { id: o.wallId },
        });
        return;
      }
      try {
        assertOpeningFits(level, o, footprints);
      } catch (error) {
        if (!isDomainError(error)) throw error;
        issues.push({
          code: 'invalid-opening',
          path: [...base, 'openings', i],
          params: { id: o.id },
        });
      }
    });

    level.rooms.forEach((room, i) => {
      const path = [...base, 'rooms', i];
      checkId(room.id, [...path, 'id']);
      checkMaterial(room.floor, [...path, 'floor']);
      checkMaterial(room.ceiling, [...path, 'ceiling']);
      const missing = room.boundary.filter((id) => !positions.has(id));
      if (missing.length > 0) {
        missing.forEach((id) =>
          issues.push({ code: 'missing-node', path: [...path, 'boundary'], params: { id } }),
        );
        return;
      }
      roomEdges(level, room).forEach((edge) => {
        if (!edge.wall) {
          issues.push({
            code: 'missing-room-edge',
            path: [...path, 'boundary', edge.index],
            params: { from: edge.from, to: edge.to },
          });
        }
      });
      const polygon = room.boundary.map((id) => positions.get(id)!);
      if (!isSimplePolygon(polygon)) {
        issues.push({
          code: 'invalid-room-polygon',
          path: [...path, 'boundary'],
          params: { id: room.id },
        });
      }
    });

    level.items.forEach((item, i) => {
      const path = [...base, 'items', i];
      checkId(item.id, [...path, 'id']);
      Object.entries(item.materials ?? {}).forEach(([slot, id]) =>
        checkMaterial(id, [...path, 'materials', slot]),
      );
    });
  });

  return issues;
}
