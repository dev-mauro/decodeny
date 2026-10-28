import { itemBase, itemEnvelope, resolveItemDefinition } from '@decodeny/catalog';
import { itemFootprint, pointInPolygon, type Item, type Level } from '@decodeny/domain';

/** Hasta esta altura (mm) un objeto de piso es "plano" (alfombras): no lleva mancha propia. */
export const FLAT_ITEM_MM = 30;

/**
 * ¿Lleva sombra de contacto? Muebles de piso con cuerpo (no alfombras ni lo muy bajo). Lo que
 * atraviesa losas (escaleras, ascensores, vacíos) no: no es un mueble apoyado.
 */
export function castsContactShadow(item: Item): boolean {
  const definition = resolveItemDefinition(item.def);
  return (
    definition.mount === 'floor' && !definition.floorOpening && itemEnvelope(item).height > 120
  );
}

/**
 * Muebles con sombra de contacto y dónde se apoya cada mancha (mm sobre el nivel): el piso o,
 * si el mueble está sobre una alfombra, la cara de arriba de la alfombra (si no, quedaría tapada).
 * `visible`: filtro de capas.
 */
export function contactShadowItems(
  level: Level,
  visible: (item: Item) => boolean = () => true,
): { readonly item: Item; readonly base: number }[] {
  const flats = level.items
    .filter(
      (i) =>
        resolveItemDefinition(i.def).mount === 'floor' &&
        itemEnvelope(i).height <= FLAT_ITEM_MM &&
        visible(i),
    )
    .map((i) => ({
      footprint: itemFootprint(i, itemEnvelope(i)),
      top: 1 + itemEnvelope(i).height,
    }));
  return level.items
    .filter((item) => castsContactShadow(item) && visible(item))
    .map((item) => {
      const under = flats.filter((f) => pointInPolygon(item.position, f.footprint));
      return {
        item,
        base: Math.max(itemBase(level, item), ...under.map((f) => f.top)),
      };
    });
}
