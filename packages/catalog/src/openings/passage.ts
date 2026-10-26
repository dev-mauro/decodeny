import { defineOpening } from '@decodeny/domain';
import { frame, heightParam, widthParam } from './shared';

export const passage = defineOpening({
  id: 'door.passage@1',
  kind: 'door',
  name: { es: 'Vano libre', en: 'Open passage' },
  description: { es: 'Abertura sin hoja', en: 'Opening without a leaf' },
  passable: true,
  params: {
    width: widthParam(900, 200, 8000),
    height: heightParam(2100, 300, 6000),
  },
  // Solo un tapajuntas delgado que remata el corte del muro.
  build: (p, { wallThickness }) =>
    frame(p.width, p.height, 0, wallThickness + 16, { bottom: false, bar: 20, slot: 'trim' }),
});
