import { cylinder, defineItem } from '@decodeny/domain';
import {
  depthParam,
  drawerFronts,
  handParam,
  handSign,
  heightParam,
  span,
  widthParam,
} from './shared';

/** La taza del lavamanos sobresale 3 mm de la cubierta: sin caras coplanares (z-fighting). */
const INLAY = 3;

export const toilet = defineItem({
  id: 'bath.toilet@1',
  category: 'bath',
  name: { es: 'Inodoro', en: 'Toilet' },
  keywords: ['wc', 'excusado', 'baño', 'taza'],
  mount: 'floor',
  comfortMin: { width: 340, depth: 600, height: 700 },
  params: {
    width: widthParam(380),
    depth: depthParam(680),
    height: heightParam(780),
  },
  build: (p) => {
    const r = p.width / 2;
    const tank = 180;
    const bowlZ = p.depth / 2 - r;
    return [
      cylinder('ceramic', r * 0.6, 380, [0, 190, bowlZ - 40], r * 0.8),
      cylinder('ceramic', r, 40, [0, 400, bowlZ]),
      cylinder('ceramic', r - 5, 25, [0, 432, bowlZ]),
      span('ceramic', [-r * 0.7, r * 0.7], [0, 420], [-p.depth / 2 + tank, bowlZ]),
      span('ceramic', [-r, r], [400, p.height], [-p.depth / 2, -p.depth / 2 + tank]),
    ];
  },
  affordances: () => [{ kind: 'sit', at: [0, 440, 60] }],
});

export const sinkPedestal = defineItem({
  id: 'bath.sink-pedestal@1',
  category: 'bath',
  name: { es: 'Lavamanos de pedestal', en: 'Pedestal sink' },
  keywords: ['lavatorio', 'lavabo', 'baño'],
  mount: 'floor',
  comfortMin: { width: 400, depth: 350, height: 750 },
  params: {
    width: widthParam(550),
    depth: depthParam(450),
    height: heightParam(850),
  },
  build: (p) => {
    const basin = 160;
    return [
      span(
        'ceramic',
        [-p.width / 2, p.width / 2],
        [p.height - basin, p.height - INLAY],
        [-p.depth / 2, p.depth / 2],
      ),
      cylinder('basin', Math.min(p.width, p.depth) * 0.32, INLAY, [0, p.height - INLAY / 2, 20]),
      cylinder(
        'ceramic',
        90,
        p.height - basin,
        [0, (p.height - basin) / 2, -p.depth / 2 + 130],
        70,
      ),
    ];
  },
});

export const vanity = defineItem({
  id: 'bath.vanity@1',
  category: 'bath',
  name: { es: 'Mueble de baño con lavamanos', en: 'Vanity' },
  keywords: ['vanitorio', 'lavamanos', 'mueble', 'baño'],
  mount: 'floor',
  comfortMin: { width: 500, depth: 350, height: 750 },
  params: {
    width: widthParam(800),
    depth: depthParam(480),
    height: heightParam(850),
  },
  build: (p) => {
    const x: [number, number] = [-p.width / 2, p.width / 2];
    const top = 30;
    return [
      span('stone', x, [p.height - top, p.height - INLAY], [-p.depth / 2, p.depth / 2]),
      span('lacquer', x, [100, p.height - top], [-p.depth / 2, p.depth / 2 - 20]),
      span('dark', [x[0] + 20, x[1] - 20], [0, 100], [-p.depth / 2, p.depth / 2 - 60]),
      ...drawerFronts(x, [100, p.height - top], 2, p.depth),
      cylinder('basin', Math.min(p.width * 0.22, p.depth * 0.32), INLAY, [
        0,
        p.height - INLAY / 2,
        20,
      ]),
    ];
  },
});

export const shower = defineItem({
  id: 'bath.shower@1',
  category: 'bath',
  name: { es: 'Ducha', en: 'Shower' },
  keywords: ['receptáculo', 'plato de ducha', 'mampara', 'baño'],
  mount: 'floor',
  comfortMin: { width: 700, depth: 700, height: 1800 },
  params: {
    width: widthParam(900),
    depth: depthParam(900),
    height: heightParam(2000),
    side: handParam({ es: 'Mampara lateral a la', en: 'Side screen on the' }),
  },
  presets: [
    { name: { es: 'Cuadrada · 80 × 80' }, params: { width: 800, depth: 800 } },
    { name: { es: 'Cuadrada · 90 × 90' }, params: { width: 900, depth: 900 } },
    { name: { es: 'Rectangular · 120 × 80' }, params: { width: 1200, depth: 800 } },
  ],
  solid: false,
  build: (p) => {
    const x: [number, number] = [-p.width / 2, p.width / 2];
    const z: [number, number] = [-p.depth / 2, p.depth / 2];
    const tray = 60;
    const s = handSign(p.side);
    const sideX: [number, number] = s > 0 ? [x[1] - 8, x[1]] : [x[0], x[0] + 8];
    return [
      span('ceramic', x, [0, tray], z),
      span('glass', x, [tray, p.height], [z[1] - 8, z[1]]),
      span('glass', sideX, [tray, p.height], [z[0], z[1] - 8]),
      span('chrome', [-15, 15], [tray, p.height], [z[0], z[0] + 30]),
      cylinder('chrome', 100, 15, [0, p.height - 120, z[0] + 160]),
    ];
  },
});

export const bathtub = defineItem({
  id: 'bath.tub@1',
  category: 'bath',
  name: { es: 'Tina', en: 'Bathtub' },
  keywords: ['bañera', 'baño', 'tina'],
  mount: 'floor',
  comfortMin: { width: 1200, depth: 650, height: 450 },
  params: {
    width: widthParam(1700),
    depth: depthParam(750),
    height: heightParam(560),
  },
  build: (p) => {
    const wall = 80;
    const x: [number, number] = [-p.width / 2, p.width / 2];
    const z: [number, number] = [-p.depth / 2, p.depth / 2];
    return [
      span('ceramic', x, [0, 180], z),
      span('ceramic', x, [180, p.height], [z[0], z[0] + wall]),
      span('ceramic', x, [180, p.height], [z[1] - wall, z[1]]),
      span('ceramic', [x[0], x[0] + wall], [180, p.height], [z[0] + wall, z[1] - wall]),
      span('ceramic', [x[1] - wall, x[1]], [180, p.height], [z[0] + wall, z[1] - wall]),
      span('water', [x[0] + wall, x[1] - wall], [180, 200], [z[0] + wall, z[1] - wall]),
    ];
  },
  affordances: () => [{ kind: 'lie', at: [0, 200, 0] }],
});
