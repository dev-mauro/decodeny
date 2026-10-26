import { cylinder, defineItem, lengthParam } from '@decodeny/domain';
import { depthParam, heightParam, legs, span, widthParam } from './shared';

export const tableRect = defineItem({
  id: 'furniture.table-rect@1',
  category: 'table',
  name: { es: 'Mesa rectangular', en: 'Rectangular table' },
  keywords: ['comedor', 'mesa', 'dining'],
  mount: 'floor',
  comfortMin: { width: 600, depth: 500, height: 400 },
  params: {
    width: widthParam(1600),
    depth: depthParam(900),
    height: heightParam(750),
    top: lengthParam({
      default: 30,
      min: 5,
      max: 300,
      step: 5,
      advanced: true,
      label: { es: 'Grosor de cubierta', en: 'Top thickness' },
    }),
  },
  presets: [
    { name: { es: '4 personas · 120 × 80' }, params: { width: 1200, depth: 800 } },
    { name: { es: '6 personas · 160 × 90' }, params: { width: 1600, depth: 900 } },
    { name: { es: '8 personas · 220 × 100' }, params: { width: 2200, depth: 1000 } },
  ],
  build: (p) => [
    span(
      'wood',
      [-p.width / 2, p.width / 2],
      [p.height - p.top, p.height],
      [-p.depth / 2, p.depth / 2],
    ),
    ...legs(p.width, p.depth, p.height - p.top, 60, 40),
  ],
});

export const tableRound = defineItem({
  id: 'furniture.table-round@1',
  category: 'table',
  name: { es: 'Mesa redonda', en: 'Round table' },
  keywords: ['comedor', 'mesa', 'circular'],
  mount: 'floor',
  comfortMin: { width: 600, depth: 600, height: 400 },
  params: {
    diameter: lengthParam({
      default: 1100,
      min: 100,
      max: 6000,
      step: 10,
      label: { es: 'Diámetro', en: 'Diameter' },
    }),
    height: heightParam(750),
  },
  presets: [
    { name: { es: '2 personas · Ø 80' }, params: { diameter: 800 } },
    { name: { es: '4 personas · Ø 110' }, params: { diameter: 1100 } },
    { name: { es: '6 personas · Ø 140' }, params: { diameter: 1400 } },
  ],
  envelope: (p) => ({ width: p.diameter, depth: p.diameter, height: p.height }),
  build: (p) => {
    const top = 30;
    const r = p.diameter / 2;
    return [
      cylinder('wood', r, top, [0, p.height - top / 2, 0]),
      cylinder('metal', 40, p.height - top - 20, [0, (p.height - top + 20) / 2, 0]),
      cylinder('metal', Math.min(r * 0.55, 320), 20, [0, 10, 0]),
    ];
  },
});

export const tableCoffee = defineItem({
  id: 'furniture.table-coffee@1',
  category: 'table',
  name: { es: 'Mesa de centro', en: 'Coffee table' },
  keywords: ['living', 'ratona', 'centro'],
  mount: 'floor',
  comfortMin: { width: 500, depth: 400, height: 250 },
  params: {
    width: widthParam(1100),
    depth: depthParam(600),
    height: heightParam(420),
  },
  build: (p) => {
    const top = 30;
    const x: [number, number] = [-p.width / 2, p.width / 2];
    const z: [number, number] = [-p.depth / 2, p.depth / 2];
    return [
      span('wood', x, [p.height - top, p.height], z),
      span('wood', [x[0] + 60, x[1] - 60], [100, 120], [z[0] + 60, z[1] - 60]),
      ...legs(p.width, p.depth, p.height - top, 45, 20),
    ];
  },
});
