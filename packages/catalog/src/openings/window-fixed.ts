import { box, defineOpening } from '@decodeny/domain';
import { frame, heightParam, sillParam, widthParam } from './shared';

const BAR = 50;
const DEPTH = 70;

export const windowFixed = defineOpening({
  id: 'window.fixed@1',
  kind: 'window',
  name: { es: 'Ventana fija', en: 'Fixed window' },
  description: { es: 'Paño de vidrio sin apertura', en: 'Non-opening glazing' },
  passable: false,
  params: {
    width: widthParam(1000, 200, 8000),
    height: heightParam(1100, 200, 6000),
    sill: sillParam(900),
  },
  build: (p) => [
    ...frame(p.width, p.height, p.sill, DEPTH, { bottom: true, bar: BAR }),
    box('glass', [p.width - 2 * BAR, p.height - 2 * BAR, 6], [0, p.sill + p.height / 2, 0]),
  ],
  plan: (p) => [
    {
      points: [
        [-p.width / 2, 0],
        [p.width / 2, 0],
      ],
    },
  ],
});
