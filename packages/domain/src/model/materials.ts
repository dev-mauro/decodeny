import { DomainError } from '../errors';
import { requireRoom, requireWall, roomEdges, wallFaceTowardRoom, type WallFace } from './queries';
import type { Level, Project, Room } from './types';

/** Superficie a la que se le asigna una terminación. */
export type SurfaceTarget =
  | { readonly kind: 'wall'; readonly wallId: string; readonly face: WallFace }
  | { readonly kind: 'floor'; readonly roomId: string }
  | { readonly kind: 'ceiling'; readonly roomId: string };

/** Id de la instancia de material de una superficie, o `null` si usa la terminación por defecto. */
export function materialOfSurface(level: Level, target: SurfaceTarget): string | null {
  switch (target.kind) {
    case 'wall':
      return requireWall(level, target.wallId).finish?.[target.face] ?? null;
    case 'floor':
      return requireRoom(level, target.roomId).floor ?? null;
    case 'ceiling':
      return requireRoom(level, target.roomId).ceiling ?? null;
  }
}

export function setSurfaceMaterial(
  level: Level,
  target: SurfaceTarget,
  materialId: string | null,
): void {
  if (target.kind === 'wall') {
    const wall = requireWall(level, target.wallId);
    const left = target.face === 'left' ? materialId : (wall.finish?.left ?? null);
    const right = target.face === 'right' ? materialId : (wall.finish?.right ?? null);
    if (left === null && right === null) delete wall.finish;
    else wall.finish = { ...(left ? { left } : {}), ...(right ? { right } : {}) };
    return;
  }
  const room = requireRoom(level, target.roomId);
  if (target.kind === 'floor') {
    if (materialId) room.floor = materialId;
    else delete room.floor;
  } else if (materialId) {
    room.ceiling = materialId;
  } else {
    delete room.ceiling;
  }
}

/** Caras interiores de los muros de un recinto (las que se ven desde adentro). */
export function roomWallTargets(level: Level, room: Room): SurfaceTarget[] {
  return roomEdges(level, room).flatMap((edge) => {
    if (!edge.wall) return [];
    const face = wallFaceTowardRoom(level, room, edge.wall.id);
    if (!face) throw new DomainError('invalid-geometry', 'Muro sin cara hacia el recinto');
    return [{ kind: 'wall', wallId: edge.wall.id, face } as const];
  });
}

/** Ids de material usados por superficies del proyecto. */
export function usedMaterialIds(project: Project): Set<string> {
  const used = new Set<string>();
  for (const level of project.levels) {
    for (const wall of level.walls) {
      if (wall.finish?.left) used.add(wall.finish.left);
      if (wall.finish?.right) used.add(wall.finish.right);
    }
    for (const room of level.rooms) {
      if (room.floor) used.add(room.floor);
      if (room.ceiling) used.add(room.ceiling);
    }
    for (const item of level.items)
      Object.values(item.materials ?? {}).forEach((id) => used.add(id));
  }
  return used;
}

/** Cuántas superficies usan cada material (para avisar que un cambio afecta a varias). */
export function materialUsage(project: Project): Map<string, number> {
  const usage = new Map<string, number>();
  const add = (id: string | undefined) => {
    if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
  };
  for (const level of project.levels) {
    for (const wall of level.walls) {
      add(wall.finish?.left);
      add(wall.finish?.right);
    }
    for (const room of level.rooms) {
      add(room.floor);
      add(room.ceiling);
    }
  }
  return usage;
}

/** Elimina las instancias que nadie usa, salvo las que el usuario nombró (paleta del proyecto). */
export function pruneUnusedMaterials(project: Project): void {
  const used = usedMaterialIds(project);
  project.materials = project.materials.filter((m) => used.has(m.id) || m.name !== undefined);
}

/** Colores ya usados en el proyecto, del más reciente al más antiguo (paleta rápida). */
export function projectColors(project: Project): string[] {
  const colors: string[] = [];
  for (let i = project.materials.length - 1; i >= 0; i--) {
    const tint = project.materials[i]!.tint;
    if (tint && !colors.includes(tint)) colors.push(tint);
  }
  return colors;
}
