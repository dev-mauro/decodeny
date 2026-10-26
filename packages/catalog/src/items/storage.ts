import { defineItem } from '@decodeny/domain';
import { countParam, depthParam, drawerFronts, heightParam, span, widthParam } from './shared';

const BOARD = 18;

export const wardrobe = defineItem({
  id: 'storage.wardrobe@1',
  category: 'storage',
  name: { es: 'Clóset', en: 'Wardrobe' },
  keywords: ['ropero', 'armario', 'closet', 'placard'],
  mount: 'floor',
  comfortMin: { width: 600, depth: 450, height: 1600 },
  params: {
    width: widthParam(1600),
    depth: depthParam(600),
    height: heightParam(2200),
    doors: countParam(2, 12, { es: 'Puertas', en: 'Doors' }),
  },
  build: (p) => {
    const front = p.depth / 2;
    const door = (p.width - 6 * (p.doors + 1)) / p.doors;
    return [
      span('wood', [-p.width / 2, p.width / 2], [0, p.height], [-p.depth / 2, front - 20]),
      ...Array.from({ length: p.doors }, (_, i) => {
        const x0 = -p.width / 2 + 6 + i * (door + 6);
        // Tirador vertical junto al borde que abre (hacia el centro del clóset).
        const handleX = x0 + (x0 + door / 2 < 0 ? door - 40 : 40);
        return [
          span('lacquer', [x0, x0 + door], [80, p.height - 6], [front - 20, front - 6]),
          span('metal', [handleX - 8, handleX + 8], [900, 1300], [front - 6, front]),
        ];
      }).flat(),
      span('dark', [-p.width / 2 + 6, p.width / 2 - 6], [0, 80], [front - 20, front - 14]),
    ];
  },
});

export const shelf = defineItem({
  id: 'storage.shelf@1',
  category: 'storage',
  name: { es: 'Estante', en: 'Bookcase' },
  keywords: ['repisa', 'biblioteca', 'librero', 'estantería'],
  mount: 'floor',
  comfortMin: { width: 400, depth: 200, height: 600 },
  params: {
    width: widthParam(900),
    depth: depthParam(300),
    height: heightParam(1800),
    shelves: countParam(5, 20, { es: 'Repisas', en: 'Shelves' }),
  },
  build: (p) => {
    const x: [number, number] = [-p.width / 2, p.width / 2];
    const z: [number, number] = [-p.depth / 2, p.depth / 2];
    const gap = (p.height - BOARD) / p.shelves;
    return [
      span('wood', [x[0], x[0] + BOARD], [0, p.height], z),
      span('wood', [x[1] - BOARD, x[1]], [0, p.height], z),
      span('wood', [x[0] + BOARD, x[1] - BOARD], [0, p.height], [z[0], z[0] + 8]),
      ...Array.from({ length: p.shelves + 1 }, (_, i) =>
        span('wood', [x[0] + BOARD, x[1] - BOARD], [i * gap, i * gap + BOARD], [z[0] + 8, z[1]]),
      ),
    ];
  },
});

export const dresser = defineItem({
  id: 'storage.dresser@1',
  category: 'storage',
  name: { es: 'Cómoda', en: 'Dresser' },
  keywords: ['cajonera', 'chiffonier', 'cajones'],
  mount: 'floor',
  comfortMin: { width: 500, depth: 350, height: 500 },
  params: {
    width: widthParam(1000),
    depth: depthParam(450),
    height: heightParam(800),
    drawers: countParam(4, 12, { es: 'Cajones', en: 'Drawers' }),
  },
  build: (p) => {
    const x: [number, number] = [-p.width / 2, p.width / 2];
    return [
      span('wood', x, [p.height - 25, p.height], [-p.depth / 2, p.depth / 2]),
      span('wood', x, [60, p.height - 25], [-p.depth / 2, p.depth / 2 - 20]),
      span('dark', [x[0] + 20, x[1] - 20], [0, 60], [-p.depth / 2, p.depth / 2 - 40]),
      ...drawerFronts(x, [60, p.height - 25], p.drawers, p.depth),
    ];
  },
});
