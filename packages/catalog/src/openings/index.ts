import { defineOpening, Registry, type AnyOpeningDefinition } from '@decodeny/domain';
import { doorDouble } from './door-double';
import { doorSingle } from './door-single';
import { doorSliding } from './door-sliding';
import { passage } from './passage';
import { frame, heightParam, sillParam, widthParam } from './shared';
import { windowCasement } from './window-casement';
import { windowFixed } from './window-fixed';
import { windowFloor } from './window-floor';
import { windowSliding } from './window-sliding';

/**
 * Catálogo de puertas y ventanas. Agregar un tipo nuevo = un archivo con `defineOpening`
 * + registrarlo aquí; el test de contrato lo valida automáticamente.
 */
export const openingCatalog = new Registry<AnyOpeningDefinition>('opening').register(
  doorSingle,
  doorDouble,
  doorSliding,
  passage,
  windowFixed,
  windowSliding,
  windowCasement,
  windowFloor,
);

/**
 * Definición de reemplazo para vanos cuyo tipo esta versión no conoce (archivo creado con una
 * versión más nueva): se dibuja el corte con un marco simple y el dato se conserva intacto.
 */
export const unknownOpening = defineOpening({
  id: 'opening.unknown@1',
  kind: 'window',
  name: { es: 'Vano desconocido', en: 'Unknown opening' },
  passable: false,
  params: {
    width: widthParam(900, 100, 10_000),
    height: heightParam(1000, 100, 10_000),
    sill: sillParam(0),
  },
  build: (p, { wallThickness }) =>
    frame(p.width, p.height, p.sill, wallThickness, { bottom: p.sill > 0, bar: 30 }),
});

/** Definición de un vano del documento (o la de reemplazo si es desconocida). */
export const resolveOpeningDefinition = (def: string): AnyOpeningDefinition =>
  openingCatalog.get(def) ?? unknownOpening;

export { doorDouble, doorSingle, doorSliding, passage };
export { windowCasement, windowFixed, windowFloor, windowSliding };
