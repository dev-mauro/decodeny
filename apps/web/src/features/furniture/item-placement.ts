import { itemEnvelope, resolveItemDefinition, surfaceElevationAt } from '@decodeny/catalog';
import { snapItemPlacement, type Item, type Level, type Vec2 } from '@decodeny/domain';

export interface ItemPlacement {
  /** Posición en planta; `z` solo si el montaje la determina (objetos de superficie). */
  readonly position: Vec2 & { readonly z?: number };
  readonly rotation: number;
}

/**
 * Dónde queda un item llevado a `center` (arrastrándolo o ubicándolo con el puntero), según su
 * montaje: los de muro siempre se apoyan en el muro más cercano; los de piso y superficie se
 * ajustan a muros (respaldo contra la pared, costado contra la esquina) o a una grilla de 1 cm;
 * los de cielo, solo a la grilla. Sin `snap` (Alt) queda donde está el puntero. Los de superficie
 * suben o bajan según el mueble que tengan debajo.
 */
export function itemPlacementAt(
  level: Level,
  item: Pick<Item, 'id' | 'def' | 'params' | 'rotation'>,
  center: Vec2,
  snap: boolean,
): ItemPlacement {
  const mount = resolveItemDefinition(item.def).mount;
  const placed =
    mount === 'wall'
      ? snapItemPlacement(level, center, item.rotation, itemEnvelope(item), { wallMounted: true })
      : snap && mount !== 'ceiling'
        ? snapItemPlacement(level, center, item.rotation, itemEnvelope(item))
        : {
            position: snap
              ? { x: Math.round(center.x / 10) * 10, y: Math.round(center.y / 10) * 10 }
              : center,
            rotation: item.rotation,
          };
  if (mount !== 'surface') return placed;
  return {
    position: { ...placed.position, z: surfaceElevationAt(level, placed.position, item.id) },
    rotation: placed.rotation,
  };
}
