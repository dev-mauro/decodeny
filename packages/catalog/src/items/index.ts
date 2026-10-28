import {
  box,
  ceilingHeightAt,
  itemFootprint,
  itemLocalToPlan,
  pointInPolygon,
  defineItem,
  definitionEnvelope,
  lengthParam,
  Registry,
  resolveParams,
  type AnyItemDefinition,
  type Item,
  type ItemCategory,
  type ItemEnvelope,
  type Level,
  type LocalPolygon,
  type Vec2,
} from '@decodeny/domain';
import { bathtub, shower, sinkPedestal, toilet, vanity } from './bath';
import { bed, nightstand } from './beds';
import { deskDrawers, deskSimple } from './desks';
import { curtain, mirror, picture, plant, rug, wallShelf } from './decor';
import { fridge, kitchenCounter } from './kitchen';
import {
  ceilingLight,
  floorLamp,
  pendantLight,
  recessedLight,
  tableLamp,
  wallLight,
} from './lighting';
import { armchair, chairDining, chairOffice, sofaL, sofaStraight } from './seating';
import { stairL, stairSpiral, stairStraight, stairU } from './stairs';

export { elevator, structureVoid } from './structure';
import { dresser, shelf, wardrobe } from './storage';
import { elevator, structureVoid } from './structure';
import { tableCoffee, tableRect, tableRound } from './tables';

/**
 * Catálogo de muebles. Agregar uno = una definición con `defineItem` + registrarla aquí;
 * el test de contrato la valida automáticamente (medidas, piezas, presets).
 */
export const itemCatalog = new Registry<AnyItemDefinition>('item').register(
  tableRect,
  tableRound,
  tableCoffee,
  chairDining,
  chairOffice,
  sofaStraight,
  sofaL,
  armchair,
  deskSimple,
  deskDrawers,
  bed,
  nightstand,
  toilet,
  sinkPedestal,
  vanity,
  shower,
  bathtub,
  wardrobe,
  shelf,
  dresser,
  kitchenCounter,
  fridge,
  recessedLight,
  ceilingLight,
  pendantLight,
  wallLight,
  floorLamp,
  tableLamp,
  mirror,
  plant,
  rug,
  curtain,
  wallShelf,
  picture,
  stairStraight,
  stairL,
  stairU,
  stairSpiral,
  structureVoid,
  elevator,
);

/** Orden de las categorías en el panel de catálogo. */
export const ITEM_CATEGORIES: readonly ItemCategory[] = [
  'sofa',
  'table',
  'chair',
  'bed',
  'desk',
  'storage',
  'kitchen',
  'bath',
  'lighting',
  'decor',
  'stairs',
];

/** Reemplazo para items de un tipo que esta versión no conoce: una caja con sus medidas. */
export const unknownItem = defineItem({
  id: 'item.unknown@1',
  category: 'storage',
  name: { es: 'Elemento desconocido', en: 'Unknown item' },
  mount: 'floor',
  params: {
    width: lengthParam({ default: 600, min: 1, max: 20_000, label: { es: 'Ancho' } }),
    depth: lengthParam({ default: 600, min: 1, max: 20_000, label: { es: 'Profundidad' } }),
    height: lengthParam({ default: 600, min: 1, max: 10_000, label: { es: 'Alto' } }),
  },
  build: (p) => [box('unknown', [p.width, p.height, p.depth], [0, p.height / 2, 0])],
});

export const resolveItemDefinition = (def: string): AnyItemDefinition =>
  itemCatalog.get(def) ?? unknownItem;

/** Envolvente de un item del documento según su definición (para avisos y ajustes). */
export function itemEnvelope(item: Pick<Item, 'def' | 'params'>): ItemEnvelope {
  const definition = resolveItemDefinition(item.def);
  return definitionEnvelope(definition, resolveParams(definition.params, item.params));
}

/** Altura de la base de un item: los de cielo cuelgan del cielo de su recinto. */
export function itemBase(level: Level, item: Item): number {
  if (resolveItemDefinition(item.def).mount !== 'ceiling') return item.position.z;
  return ceilingHeightAt(level, item.position) - itemEnvelope(item).height;
}

/**
 * Altura sobre la que se apoya un item de montaje `surface` en ese punto: la cubierta del
 * mueble de piso más alto bajo él, o el piso.
 */
export function surfaceElevationAt(level: Level, point: Vec2, exceptId?: string): number {
  let top = 0;
  for (const item of level.items) {
    if (item.id === exceptId || resolveItemDefinition(item.def).mount !== 'floor') continue;
    const env = itemEnvelope(item);
    if (pointInPolygon(point, itemFootprint(item, env))) {
      top = Math.max(top, item.position.z + env.height);
    }
  }
  return top;
}

/** Un polígono del marco local de un item llevado a la planta (mm). */
export function localPolygonToPlan(
  item: Pick<Item, 'position' | 'rotation'>,
  polygon: LocalPolygon,
): Vec2[] {
  return polygon.map(([x, z]) => itemLocalToPlan(item, x, z));
}

/** Contorno de un item en la planta: el propio de su definición o el de su envolvente. */
export function itemPlanOutline(item: Item): Vec2[] {
  const definition = resolveItemDefinition(item.def);
  if (!definition.planOutline) return itemFootprint(item, itemEnvelope(item));
  return localPolygonToPlan(
    item,
    definition.planOutline(resolveParams(definition.params, item.params)),
  );
}

/**
 * Huecos que los items de una planta abren en las losas de arriba (escaleras, ductos): polígonos
 * en planta (mm). `reach` es qué losa: 1, la de inmediato arriba; 2, la siguiente (un ascensor
 * de tres paradas atraviesa dos).
 */
export function levelFloorOpenings(level: Level, reach = 1): Vec2[][] {
  return level.items.flatMap((item) => {
    const definition = resolveItemDefinition(item.def);
    if (!definition.floorOpening) return [];
    const params = resolveParams(definition.params, item.params);
    if ((definition.openingSpan?.(params) ?? 1) < reach) return [];
    const polygon = definition.floorOpening(params);
    return polygon.length >= 3 ? [localPolygonToPlan(item, polygon)] : [];
  });
}

/**
 * Huecos en el piso (`floor`) o en el cielo (`ceiling`) de una planta, abiertos por los items
 * de esa planta o de las de abajo. `levels`, de abajo hacia arriba.
 */
export function slabOpenings(
  levels: readonly Level[],
  levelId: string,
  surface: 'floor' | 'ceiling',
): Vec2[][] {
  const index = levels.findIndex((l) => l.id === levelId);
  const first = surface === 'floor' ? 1 : 0;
  const openings: Vec2[][] = [];
  for (let k = first; k <= index; k++) {
    openings.push(...levelFloorOpenings(levels[index - k]!, k + 1 - first));
  }
  return openings;
}

export { curtain, mirror, picture, plant, rug, wallShelf };

export { spiralWalkRadius, stairL, stairSpiral, stairStraight, stairSteps, stairU } from './stairs';

export { ceilingLight, floorLamp, pendantLight, recessedLight, tableLamp, wallLight };

export {
  armchair,
  bathtub,
  bed,
  chairDining,
  chairOffice,
  deskDrawers,
  deskSimple,
  dresser,
  fridge,
  kitchenCounter,
  nightstand,
  shelf,
  shower,
  sinkPedestal,
  sofaL,
  sofaStraight,
  tableCoffee,
  tableRect,
  tableRound,
  toilet,
  vanity,
  wardrobe,
};
