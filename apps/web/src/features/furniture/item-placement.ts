import { itemEnvelope, resolveItemDefinition, surfaceElevationAt } from '@decodeny/catalog';
import {
  FLAT_ITEM_HEIGHT,
  itemFootprint,
  snapItemPlacement,
  type Item,
  type Level,
  type Vec2,
} from '@decodeny/domain';
import { snapStep } from '@/state/ui-store';

export interface ItemPlacement {
  /** Posición en planta; `z` solo si el montaje la determina (objetos de superficie). */
  readonly position: Vec2 & { readonly z?: number };
  readonly rotation: number;
  /** Muebles con los que quedó junto o alineado (para resaltarlos). */
  readonly alignedWith: readonly string[];
}

/**
 * Muebles contra los que otro puede juntarse o alinearse: los de piso con volumen (no los
 * planos, como alfombras, ni los de muro o cielo), excepto `exclude`.
 */
function neighborsOf(level: Level, exclude: ReadonlySet<string>): Item[] {
  return level.items.filter((other) => {
    if (exclude.has(other.id)) return false;
    if (resolveItemDefinition(other.def).mount !== 'floor') return false;
    return itemEnvelope(other).height > FLAT_ITEM_HEIGHT;
  });
}

/**
 * Dónde queda un item llevado a `center` (arrastrándolo o ubicándolo con el puntero), según su
 * montaje: los de muro siempre se apoyan en el muro más cercano; los de piso y superficie se
 * ajustan a muros (respaldo contra la pared, costado contra la esquina), se juntan o alinean con
 * los muebles vecinos, o se redondean a una grilla de 1 cm; los de cielo, solo a la grilla. Sin
 * `snap` (Alt) queda donde está el puntero. Los de superficie suben o bajan según el mueble que
 * tengan debajo.
 */
export function itemPlacementAt(
  level: Level,
  item: Pick<Item, 'id' | 'def' | 'params' | 'rotation'>,
  center: Vec2,
  snap: boolean,
  /** Paso de la grilla (mm): el de la cuadrícula activa o 1 cm. */
  gridStep = snapStep(),
): ItemPlacement {
  const mount = resolveItemDefinition(item.def).mount;
  const env = itemEnvelope(item);
  let placed: ItemPlacement;
  if (mount === 'wall') {
    const s = snapItemPlacement(level, center, item.rotation, env, { wallMounted: true });
    placed = { position: s.position, rotation: s.rotation, alignedWith: [] };
  } else if (snap && mount === 'floor' && env.height > FLAT_ITEM_HEIGHT) {
    const neighbors = neighborsOf(level, new Set([item.id]));
    const s = snapItemPlacement(level, center, item.rotation, env, {
      neighbors: neighbors.map((n) => itemFootprint(n, itemEnvelope(n))),
      gridStep,
    });
    placed = {
      position: s.position,
      rotation: s.rotation,
      alignedWith: s.neighbors.map((i) => neighbors[i]!.id),
    };
  } else if (snap && mount !== 'ceiling') {
    const s = snapItemPlacement(level, center, item.rotation, env, { gridStep });
    placed = { position: s.position, rotation: s.rotation, alignedWith: [] };
  } else {
    placed = {
      position: snap
        ? {
            x: Math.round(center.x / gridStep) * gridStep,
            y: Math.round(center.y / gridStep) * gridStep,
          }
        : center,
      rotation: item.rotation,
      alignedWith: [],
    };
  }
  if (mount !== 'surface') return placed;
  return {
    ...placed,
    position: { ...placed.position, z: surfaceElevationAt(level, placed.position, item.id) },
  };
}
