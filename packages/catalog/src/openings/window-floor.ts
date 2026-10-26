import { box, defineOpening, numberParam } from '@decodeny/domain';
import { frame, heightParam, widthParam } from './shared';

const BAR = 60;
const DEPTH = 90;
const MULLION = 50;

export const windowFloor = defineOpening({
  id: 'window.floor@1',
  kind: 'window',
  name: { es: 'Ventanal piso-cielo', en: 'Floor-to-ceiling window' },
  description: { es: 'Paños fijos desde el piso', en: 'Fixed glazing from the floor' },
  passable: false,
  params: {
    width: widthParam(2400, 400, 12000),
    height: heightParam(2300, 600, 6000),
    panes: numberParam({
      default: 2,
      min: 1,
      max: 8,
      step: 1,
      unit: 'count',
      label: { es: 'Paños', en: 'Panes' },
    }),
  },
  build: (p) => {
    const clear = p.width - 2 * BAR;
    const pane = (clear - (p.panes - 1) * MULLION) / p.panes;
    const glassHeight = p.height - 2 * BAR;
    return [
      ...frame(p.width, p.height, 0, DEPTH, { bottom: true, bar: BAR }),
      ...Array.from({ length: p.panes }, (_, i) => {
        const x = -clear / 2 + pane / 2 + i * (pane + MULLION);
        return box('glass', [pane, glassHeight, 8], [x, p.height / 2, 0]);
      }),
      ...Array.from({ length: p.panes - 1 }, (_, i) => {
        const x = -clear / 2 + (i + 1) * (pane + MULLION) - MULLION / 2;
        return box('frame', [MULLION, glassHeight, DEPTH - 10], [x, p.height / 2, 0]);
      }),
    ];
  },
  plan: (p) => [
    {
      points: [
        [-p.width / 2, 0],
        [p.width / 2, 0],
      ],
    },
  ],
});
