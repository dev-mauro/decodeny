import { box, defineOpening } from '@decodeny/domain';
import {
  DEG,
  faceSign,
  frame,
  handleHeight,
  handles,
  heightParam,
  leafAngle,
  openAngleParam,
  swingParam,
  swingParts,
  swingSymbol,
  widthParam,
} from './shared';

const BAR = 40;
const LEAF = 40;
const GAP = 3;

function leaves(width: number, wallThickness: number, swing: string) {
  const f = faceSign(swing);
  const length = (width - 2 * BAR - 3 * GAP) / 2;
  return ([-1, 1] as const).map((h) => ({
    h,
    f,
    length,
    pivot: [h * (width / 2 - BAR - GAP), (f * wallThickness) / 2] as [number, number],
  }));
}

export const doorDouble = defineOpening({
  id: 'door.double@1',
  kind: 'door',
  name: { es: 'Puerta doble', en: 'Double door' },
  description: { es: 'Dos hojas batientes', en: 'Two hinged leaves' },
  passable: true,
  operable: { param: 'openAngle', closed: 0 },
  params: {
    width: widthParam(1400, 600, 3600),
    height: heightParam(2000, 600, 4000),
    swing: swingParam(),
    openAngle: openAngleParam(90),
  },
  build: (p, { wallThickness }) => {
    const height = p.height - BAR - GAP;
    return [
      ...frame(p.width, p.height, 0, wallThickness + 20, { bottom: false, bar: BAR }),
      ...leaves(p.width, wallThickness, p.swing).flatMap(({ h, f, length, pivot }) => {
        const z = pivot[1] - (f * LEAF) / 2;
        const closed = [
          box('leaf', [length, height, LEAF], [pivot[0] - (h * length) / 2, height / 2, z]),
          ...handles(pivot[0] - h * (length - 70), z, LEAF, handleHeight(p.height)),
        ];
        return swingParts(closed, pivot, leafAngle(h, f, p.openAngle * DEG));
      }),
    ];
  },
  plan: (p, { wallThickness }) =>
    leaves(p.width, wallThickness, p.swing).flatMap(({ h, f, length, pivot }) =>
      swingSymbol(pivot, length, h, f),
    ),
});
