import { defineOpening, numberParam } from '@decodeny/domain';
import { frame, glazedSash, heightParam, openPercentParam, sillParam, widthParam } from './shared';

const BAR = 45;
const DEPTH = 90;
const OVERLAP = 40;
const TRACK = 22;

function sashes(width: number, panes: number, open: number) {
  const clear = width - 2 * BAR;
  const sashWidth = (clear + OVERLAP * (panes - 1)) / panes;
  return Array.from({ length: panes }, (_, i) => {
    const closedX = -clear / 2 + sashWidth / 2 + i * (sashWidth - OVERLAP);
    // Hojas alternadas en dos rieles; la primera se desliza sobre la siguiente.
    const z = i % 2 === 0 ? TRACK : -TRACK;
    const x = i === 0 ? closedX + ((sashWidth - OVERLAP) * open) / 100 : closedX;
    return { x, z, width: sashWidth };
  });
}

export const windowSliding = defineOpening({
  id: 'window.sliding@1',
  kind: 'window',
  name: { es: 'Ventana corredera', en: 'Sliding window' },
  description: { es: 'Hojas que se deslizan en rieles', en: 'Sashes sliding on tracks' },
  passable: false,
  params: {
    width: widthParam(1500, 400, 8000),
    height: heightParam(1100, 200, 6000),
    sill: sillParam(900),
    panes: numberParam({
      default: 2,
      min: 2,
      max: 4,
      step: 1,
      unit: 'count',
      label: { es: 'Hojas', en: 'Sashes' },
    }),
    open: openPercentParam(0),
  },
  build: (p) => [
    ...frame(p.width, p.height, p.sill, DEPTH, { bottom: true, bar: BAR }),
    ...sashes(p.width, p.panes, p.open).flatMap((s) =>
      glazedSash(s.width, p.height - 2 * BAR, p.sill + BAR, s.x, s.z, { bar: 35, depth: 34 }),
    ),
  ],
  plan: (p) =>
    sashes(p.width, p.panes, 0).map((s) => ({
      points: [
        [s.x - s.width / 2, s.z],
        [s.x + s.width / 2, s.z],
      ],
    })),
});
