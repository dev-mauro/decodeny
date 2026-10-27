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
  moveItems,
  rotateItems,
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
  type Item,
  type ItemEnvelope,
  type Level,
  type Opening,
  type Params,
  type Room,
  type Vec2,
} from '@decodeny/domain';
import { itemGroupOf, type ViewerSelection } from '@decodeny/viewer';
import { useProjectStore } from '@/state/project-store';
import { selectedTargets } from '@/state/selection-model';
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

/** Muebles seleccionados (el principal primero) del nivel activo. */
export function selectedItems(): { level: Level; items: Item[] } {
  const ui = useUiStore.getState();
  const level = activeLevel(useProjectStore.getState().project, ui.levelId);
  const items = selectedTargets(ui).flatMap((target) => {
    const item = target.kind === 'item' ? level.items.find((i) => i.id === target.id) : undefined;
    return item ? [item] : [];
  });
  return { level, items };
}

/** Selecciona los muebles indicados; el primero queda como principal. */
function selectItems(itemIds: readonly string[]): void {
  useUiStore.getState().selectMany(itemIds.map((id) => ({ kind: 'item', id }) as const).reverse());
}

export function duplicateSelectedItems(): boolean {
  const { level, items } = selectedItems();
  if (items.length === 0) return false;
  const out = runCommand(duplicateItems, {
    levelId: level.id,
    itemIds: items.map((i) => i.id),
    offset: { x: COPY_OFFSET, y: -COPY_OFFSET },
  });
  if (out.ok) selectItems(out.result.itemIds);
  return true;
}

export function copySelectedItems(): boolean {
  const { items } = selectedItems();
  if (items.length === 0) return false;
  useUiStore.getState().setClipboard(items.map((i) => structuredClone(i)));
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
  if (out.ok && out.result.itemIds.length > 0) {
    selectItems(out.result.itemIds);
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

/** Gira la selección: un mueble gira en su lugar; varios, alrededor de su centro. */
export function rotateSelectedItems(degrees: number): boolean {
  const { level, items } = selectedItems();
  const [first] = items;
  if (!first) return false;
  const key = `rot:${items.map((i) => i.id).join(',')}`;
  if (items.length === 1) {
    runCommand(
      updateItem,
      { levelId: level.id, itemId: first.id, rotation: first.rotation + degrees },
      { coalesceKey: key },
    );
  } else {
    runCommand(
      rotateItems,
      { levelId: level.id, itemIds: items.map((i) => i.id), degrees },
      { coalesceKey: key },
    );
  }
  return true;
}

export function nudgeSelectedItems(dx: number, dy: number): boolean {
  const { level, items } = selectedItems();
  if (items.length === 0) return false;
  runCommand(
    moveItems,
    { levelId: level.id, itemIds: items.map((i) => i.id), delta: { x: dx, y: dy } },
    { coalesceKey: `nudge:${items.map((i) => i.id).join(',')}` },
  );
  return true;
}

export function deleteSelectedItems(): boolean {
  const { level, items } = selectedItems();
  if (items.length === 0) return false;
  runCommand(deleteItems, { levelId: level.id, itemIds: items.map((i) => i.id) });
  return true;
}

/** Selecciona todos los muebles visibles del nivel (Ctrl+A). */
export function selectAllItems(): boolean {
  const { level } = current();
  const { hiddenGroups } = useUiStore.getState();
  const ids = level.items
    .filter((i) => !hiddenGroups.has(itemGroupOf(resolveItemDefinition(i.def).category)))
    .map((i) => i.id);
  if (ids.length === 0) return false;
  selectItems(ids);
  return true;
}

/** Muebles visibles cuyo centro cae dentro del recuadro (planta, mm). */
export function itemsInArea(level: Level, min: Vec2, max: Vec2): string[] {
  const { hiddenGroups } = useUiStore.getState();
  return level.items
    .filter(
      (i) =>
        !hiddenGroups.has(itemGroupOf(resolveItemDefinition(i.def).category)) &&
        i.position.x >= min.x &&
        i.position.x <= max.x &&
        i.position.y >= min.y &&
        i.position.y <= max.y,
    )
    .map((i) => i.id);
}
