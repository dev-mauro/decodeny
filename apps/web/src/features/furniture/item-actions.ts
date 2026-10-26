import { itemEnvelope, resolveItemDefinition, surfaceElevationAt } from '@decodeny/catalog';
import {
  defaultParams,
  deleteItems,
  duplicateItems,
  interiorPoint,
  itemFootprint,
  pasteItems,
  roomInteriorPolygon,
  roomOfItem,
  roomsOfWall,
  snapItemPlacement,
  updateItem,
  definitionEnvelope,
  add,
  lerp,
  levelWallFootprints,
  openingEnvelope,
  perpLeft,
  polygonsOverlap,
  roomSides,
  scale,
  type AnyItemDefinition,
  type ItemEnvelope,
  type Level,
  type Opening,
  type Params,
  type Room,
  type Vec2,
} from '@decodeny/domain';
import type { ViewerSelection } from '@decodeny/viewer';
import { useProjectStore } from '@/state/project-store';
import { activeLevel, useUiStore } from '@/state/ui-store';
import { runCommand } from '@/state/use-command';

/** Desplazamiento de una copia respecto del original (mm). */
const COPY_OFFSET = 300;

function current(): { level: Level; selection: ViewerSelection | null } {
  const ui = useUiStore.getState();
  return {
    level: activeLevel(useProjectStore.getState().project, ui.levelId),
    selection: ui.selection,
  };
}

/** Recinto activo según la selección: donde se agregan los muebles nuevos. */
export function targetRoom(level: Level, selection: ViewerSelection | null): Room | undefined {
  switch (selection?.kind) {
    case 'room':
      return level.rooms.find((r) => r.id === selection.id);
    case 'item': {
      const item = level.items.find((i) => i.id === selection.id);
      return item ? roomOfItem(level, item) : undefined;
    }
    case 'wall':
      return roomsOfWall(level, selection.id)[0];
    case 'opening': {
      const opening = level.openings.find((o) => o.id === selection.id);
      return opening ? roomsOfWall(level, opening.wallId)[0] : undefined;
    }
    default:
      return level.rooms[0];
  }
}

/** Huella en planta de un vano (rectángulo a lo largo del muro, de todo su espesor). */
function openingFootprint(level: Level, opening: Opening): Vec2[] | null {
  const fp = levelWallFootprints(level).get(opening.wallId);
  if (!fp) return null;
  const { width } = openingEnvelope(opening);
  const n = perpLeft(fp.dir);
  const half = fp.thickness / 2 + 5;
  const at = (along: number, side: number) =>
    add(add(fp.start, scale(fp.dir, along)), scale(n, side * half));
  const a = opening.offset - width / 2;
  const b = opening.offset + width / 2;
  return [at(a, -1), at(b, -1), at(b, 1), at(a, 1)];
}

/**
 * Lugar libre en los muros del recinto para un item de muro (cuadro, espejo, aplique): prueba
 * varios puntos de cada lado y elige el primero que no tapa una puerta o ventana a su altura.
 */
function freeWallSpot(
  level: Level,
  room: Room | undefined,
  fallback: Vec2,
  env: ItemEnvelope,
  z: number,
) {
  const blocked = level.openings.flatMap((opening) => {
    const fp = openingFootprint(level, opening);
    const { sill, height } = openingEnvelope(opening);
    return fp && z < sill + height && z + env.height > sill ? [fp] : [];
  });
  const candidates: Vec2[] = [];
  if (room) {
    for (const side of roomSides(level, room)) {
      for (const t of [0.5, 0.25, 0.75]) candidates.push(lerp(side.start, side.end, t));
    }
  }
  for (const candidate of candidates) {
    const snap = snapItemPlacement(level, candidate, 0, env, { wallMounted: true });
    const footprint = itemFootprint(
      { position: { ...snap.position, z }, rotation: snap.rotation },
      env,
    );
    if (!blocked.some((b) => polygonsOverlap(footprint, b))) return snap;
  }
  return snapItemPlacement(level, fallback, 0, env, { wallMounted: true });
}

/** Muebles sobre los que se apoyan objetos de superficie (mesas, escritorios, veladores…). */
const SURFACE_TOP = { min: 300, max: 1300 };

export interface InitialItemSpot {
  readonly params: Params;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation: number;
}

/**
 * Dónde aparece un item del catálogo antes de que el usuario lo ubique, en el recinto activo y
 * según su montaje: los de piso, en el lugar más despejado; los de muro, en el muro más cercano a
 * su altura típica sin tapar vanos; los de cielo, al centro; los de superficie, sobre una mesa o
 * mueble bajo si hay.
 */
export function initialItemSpot(level: Level, definition: AnyItemDefinition): InitialItemSpot {
  const { selection } = current();
  const room = targetRoom(level, selection) ?? level.rooms[0];
  const params = { ...defaultParams(definition.params) };
  const env = definitionEnvelope(definition, params);
  const obstacles =
    definition.mount === 'floor'
      ? level.items.map((item) => itemFootprint(item, itemEnvelope(item)))
      : [];
  let position = room
    ? interiorPoint(roomInteriorPolygon(level, room), 24, obstacles)
    : { x: 0, y: 0 };
  let rotation = 0;
  let z = 0;
  if (definition.mount === 'wall') {
    z = definition.defaultElevation ?? 0;
    const snap = freeWallSpot(level, room, position, env, z);
    position = snap.position;
    rotation = snap.rotation;
  } else if (definition.mount === 'surface') {
    const support = level.items.find((item) => {
      if (resolveItemDefinition(item.def).mount !== 'floor') return false;
      const top = item.position.z + itemEnvelope(item).height;
      return (
        top >= SURFACE_TOP.min &&
        top <= SURFACE_TOP.max &&
        (!room || roomOfItem(level, item)?.id === room.id)
      );
    });
    if (support) position = support.position;
    z = surfaceElevationAt(level, position);
  }
  return {
    params,
    // Lo apoyado en un muro conserva la posición exacta del ajuste (redondear lo metería en él).
    position:
      definition.mount === 'wall'
        ? { ...position, z }
        : { x: Math.round(position.x / 10) * 10, y: Math.round(position.y / 10) * 10, z },
    rotation,
  };
}

function selectedItem() {
  const { level, selection } = current();
  const item =
    selection?.kind === 'item' ? level.items.find((i) => i.id === selection.id) : undefined;
  return { level, item };
}

export function duplicateSelectedItem(): boolean {
  const { level, item } = selectedItem();
  if (!item) return false;
  const out = runCommand(duplicateItems, {
    levelId: level.id,
    itemIds: [item.id],
    offset: { x: COPY_OFFSET, y: -COPY_OFFSET },
  });
  const copy = out.ok ? out.result.itemIds[0] : undefined;
  if (copy) useUiStore.getState().select({ kind: 'item', id: copy });
  return true;
}

export function copySelectedItem(): boolean {
  const { item } = selectedItem();
  if (!item) return false;
  useUiStore.getState().setClipboard([structuredClone(item)]);
  return true;
}

export function pasteItemsFromClipboard(): boolean {
  const { clipboard } = useUiStore.getState();
  if (clipboard.length === 0) return false;
  const { level } = current();
  const out = runCommand(pasteItems, {
    levelId: level.id,
    items: clipboard,
    offset: { x: COPY_OFFSET, y: -COPY_OFFSET },
  });
  const first = out.ok ? out.result.itemIds[0] : undefined;
  if (first) {
    useUiStore.getState().select({ kind: 'item', id: first });
    // Pegar varias veces sigue desplazando las copias.
    useUiStore.getState().setClipboard(
      clipboard.map((i) => ({
        ...i,
        position: { ...i.position, x: i.position.x + COPY_OFFSET, y: i.position.y - COPY_OFFSET },
      })),
    );
  }
  return true;
}

export function rotateSelectedItem(degrees: number): boolean {
  const { level, item } = selectedItem();
  if (!item) return false;
  runCommand(
    updateItem,
    { levelId: level.id, itemId: item.id, rotation: item.rotation + degrees },
    { coalesceKey: `rot:${item.id}` },
  );
  return true;
}

export function nudgeSelectedItem(dx: number, dy: number): boolean {
  const { level, item } = selectedItem();
  if (!item) return false;
  runCommand(
    updateItem,
    {
      levelId: level.id,
      itemId: item.id,
      position: { x: item.position.x + dx, y: item.position.y + dy },
    },
    { coalesceKey: `nudge:${item.id}` },
  );
  return true;
}

export function deleteSelectedItem(): boolean {
  const { level, item } = selectedItem();
  if (!item) return false;
  runCommand(deleteItems, { levelId: level.id, itemIds: [item.id] });
  return true;
}
