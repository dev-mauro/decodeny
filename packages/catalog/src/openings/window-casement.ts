import { defineOpening, numberParam } from '@decodeny/domain';
import {
  DEG,
  endSign,
  faceSign,
  frame,
  glazedSash,
  heightParam,
  hingeParam,
  leafAngle,
  openAngleParam,
  sillParam,
  swingParam,
  swingParts,
  swingSymbol,
  widthParam,
} from './shared';

const BAR = 50;
const DEPTH = 70;
const SASH = 50;

/** Hojas: una (con bisagra en `hinge`) o dos (bisagras en ambos extremos). */
function sashLayout(width: number, leaves: number, hinge: string, swing: string) {
  const f = faceSign(swing);
  const clear = width - 2 * BAR;
  const hinges: (1 | -1)[] = leaves === 1 ? [endSign(hinge)] : [-1, 1];
  const length = clear / hinges.length;
  return hinges.map((h) => ({
    h,
    f,
    length,
    pivot: [h * (clear / 2), (f * DEPTH) / 2] as [number, number],
  }));
}

export const windowCasement = defineOpening({
  id: 'window.casement@1',
  kind: 'window',
  name: { es: 'Ventana de abatir', en: 'Casement window' },
  description: { es: 'Hojas con bisagras laterales', en: 'Side-hinged sashes' },
  passable: false,
  params: {
    width: widthParam(1000, 300, 3000),
    height: heightParam(1100, 200, 6000),
    sill: sillParam(900),
    leaves: numberParam({
      default: 2,
      min: 1,
      max: 2,
      step: 1,
      unit: 'count',
      label: { es: 'Hojas', en: 'Sashes' },
    }),
    hinge: hingeParam({ es: 'Bisagras (una hoja)', en: 'Hinges (single sash)' }),
    swing: swingParam(),
    openAngle: openAngleParam(0, 90),
  },
  build: (p) => {
    const height = p.height - 2 * BAR;
    return [
      ...frame(p.width, p.height, p.sill, DEPTH, { bottom: true, bar: BAR }),
      ...sashLayout(p.width, p.leaves, p.hinge, p.swing).flatMap(({ h, f, length, pivot }) => {
        const closed = glazedSash(
          length,
          height,
          p.sill + BAR,
          pivot[0] - (h * length) / 2,
          pivot[1] - (f * SASH) / 2,
          { bar: 40, depth: SASH },
        );
        return swingParts(closed, pivot, leafAngle(h, f, p.openAngle * DEG));
      }),
    ];
  },
  plan: (p) =>
    sashLayout(p.width, p.leaves, p.hinge, p.swing).flatMap(({ h, f, length, pivot }) =>
      swingSymbol(pivot, length, h, f, 12),
    ),
});
