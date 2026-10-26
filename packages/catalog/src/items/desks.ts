import { defineItem } from '@decodeny/domain';
import {
  depthParam,
  drawerFronts,
  handParam,
  handSign,
  heightParam,
  span,
  widthParam,
} from './shared';

const TOP = 30;
const PANEL = 25;

const deskParams = (width: number) => ({
  width: widthParam(width),
  depth: depthParam(600),
  height: heightParam(750),
});

/** Cubierta con dos laterales y faldón posterior. */
function deskFrame(width: number, depth: number, height: number) {
  const x: [number, number] = [-width / 2, width / 2];
  const z: [number, number] = [-depth / 2, depth / 2];
  return [
    span('wood', x, [height - TOP, height], z),
    span('lacquer', [x[0], x[0] + PANEL], [0, height - TOP], z),
    span('lacquer', [x[1] - PANEL, x[1]], [0, height - TOP], z),
    span(
      'lacquer',
      [x[0] + PANEL, x[1] - PANEL],
      [height - TOP - 350, height - TOP],
      [z[0] + 40, z[0] + 58],
    ),
  ];
}

export const deskSimple = defineItem({
  id: 'furniture.desk@1',
  category: 'desk',
  name: { es: 'Escritorio', en: 'Desk' },
  keywords: ['oficina', 'estudio', 'mesa de trabajo'],
  mount: 'floor',
  comfortMin: { width: 800, depth: 450, height: 650 },
  params: deskParams(1200),
  presets: [
    { name: { es: 'Compacto · 100 × 50' }, params: { width: 1000, depth: 500 } },
    { name: { es: 'Estándar · 120 × 60' }, params: { width: 1200, depth: 600 } },
    { name: { es: 'Amplio · 160 × 80' }, params: { width: 1600, depth: 800 } },
  ],
  build: (p) => deskFrame(p.width, p.depth, p.height),
});

export const deskDrawers = defineItem({
  id: 'furniture.desk-drawers@1',
  category: 'desk',
  name: { es: 'Escritorio con cajonera', en: 'Desk with drawers' },
  keywords: ['oficina', 'estudio', 'cajones'],
  mount: 'floor',
  comfortMin: { width: 800, depth: 450, height: 650 },
  params: {
    ...deskParams(1400),
    drawers: handParam({ es: 'Cajonera a la', en: 'Drawers on the' }),
  },
  build: (p) => {
    const unit = Math.min(420, p.width / 3);
    const side = handSign(p.drawers);
    const x: [number, number] =
      side > 0
        ? [p.width / 2 - PANEL - unit, p.width / 2 - PANEL]
        : [-p.width / 2 + PANEL, -p.width / 2 + PANEL + unit];
    const bodyTop = p.height - TOP;
    return [
      ...deskFrame(p.width, p.depth, p.height),
      span('lacquer', x, [0, bodyTop], [-p.depth / 2 + 60, p.depth / 2 - 20]),
      ...drawerFronts(x, [0, bodyTop], 3, p.depth),
    ];
  },
});
