import { box, defineOpening } from '@decodeny/domain';
import {
  endSign,
  faceSign,
  frame,
  handleHeight,
  heightParam,
  hingeParam,
  openPercentParam,
  swingParam,
  widthParam,
} from './shared';

const BAR = 30;
const LEAF = 40;
const OVERLAP = 30;

function layout(width: number, wallThickness: number, side: string, slideTo: string, open: number) {
  const f = faceSign(side);
  const s = endSign(slideTo);
  const clear = width - 2 * BAR;
  const length = clear + 2 * OVERLAP;
  const z = f * (wallThickness / 2 + 10 + LEAF / 2);
  return { f, s, clear, length, z, x: (s * clear * open) / 100 };
}

export const doorSliding = defineOpening({
  id: 'door.sliding@1',
  kind: 'door',
  name: { es: 'Puerta corredera', en: 'Sliding door' },
  description: {
    es: 'Hoja que se desliza por la cara del muro',
    en: 'Leaf sliding along the wall',
  },
  passable: true,
  params: {
    width: widthParam(800, 400, 3000),
    height: heightParam(2000, 600, 4000),
    side: swingParam({ es: 'Corre por la cara', en: 'Runs on side' }),
    slideTo: hingeParam({ es: 'Se abre hacia', en: 'Slides toward' }),
    open: openPercentParam(100),
  },
  build: (p, { wallThickness }) => {
    const { f, s, clear, length, z, x } = layout(p.width, wallThickness, p.side, p.slideTo, p.open);
    const height = p.height - 10;
    return [
      ...frame(p.width, p.height, 0, wallThickness + 20, { bottom: false, bar: BAR }),
      box('rail', [2 * clear + 2 * OVERLAP, 40, 30], [(s * clear) / 2, p.height + 25, z + f * 5]),
      box('leaf', [length, height, LEAF], [x, height / 2, z]),
      box(
        'handle',
        [18, Math.min(260, p.height / 3), 24],
        [x - s * (length / 2 - 60), handleHeight(p.height), z + f * (LEAF / 2 + 12)],
      ),
    ];
  },
  plan: (p, { wallThickness }) => {
    const { s, length, z, x, clear } = layout(p.width, wallThickness, p.side, p.slideTo, 100);
    return [
      {
        points: [
          [x - length / 2, z],
          [x + length / 2, z],
        ],
      },
      {
        points: [
          [-s * (clear / 2), z],
          [s * (clear / 2), z],
        ],
        dashed: true,
      },
    ];
  },
});
