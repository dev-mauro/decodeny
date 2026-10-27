import { box, defineOpening } from '@decodeny/domain';
import {
  DEG,
  endSign,
  faceSign,
  frame,
  handleHeight,
  handles,
  heightParam,
  hingeParam,
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

/** Geometría compartida por la vista 3D y el símbolo de planta. */
function leafLayout(width: number, wallThickness: number, hinge: string, swing: string) {
  const h = endSign(hinge);
  const f = faceSign(swing);
  const length = width - 2 * BAR - 2 * GAP;
  const pivot: [number, number] = [h * (width / 2 - BAR - GAP), (f * wallThickness) / 2];
  return { h, f, length, pivot };
}

export const doorSingle = defineOpening({
  id: 'door.single@1',
  kind: 'door',
  name: { es: 'Puerta batiente', en: 'Hinged door' },
  description: { es: 'Una hoja con bisagras', en: 'Single hinged leaf' },
  passable: true,
  operable: { param: 'openAngle', closed: 0 },
  params: {
    width: widthParam(800, 400, 1600),
    height: heightParam(2000, 600, 4000),
    hinge: hingeParam(),
    swing: swingParam(),
    openAngle: openAngleParam(90),
  },
  build: (p, { wallThickness }) => {
    const { h, f, length, pivot } = leafLayout(p.width, wallThickness, p.hinge, p.swing);
    const height = p.height - BAR - GAP;
    const z = pivot[1] - (f * LEAF) / 2;
    const closed = [
      box('leaf', [length, height, LEAF], [pivot[0] - (h * length) / 2, height / 2, z]),
      ...handles(pivot[0] - h * (length - 70), z, LEAF, handleHeight(p.height)),
    ];
    return [
      ...frame(p.width, p.height, 0, wallThickness + 20, { bottom: false, bar: BAR }),
      ...swingParts(closed, pivot, leafAngle(h, f, p.openAngle * DEG)),
    ];
  },
  plan: (p, { wallThickness }) => {
    const { h, f, length, pivot } = leafLayout(p.width, wallThickness, p.hinge, p.swing);
    return swingSymbol(pivot, length, h, f);
  },
});
