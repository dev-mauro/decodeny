import {
  colorParam,
  cylinder,
  defineItem,
  imageParam,
  lengthParam,
  tinted,
  type Part,
} from '@decodeny/domain';
import { countParam, depthParam, heightParam, span, widthParam } from './shared';

const colorOf = (def: string, es = 'Color', en = 'Color') =>
  colorParam({ default: def, label: { es, en } });

/** Profundidad de objetos que se apoyan en el muro (cuadros, espejos). */
const thinDepth = (def: number) =>
  lengthParam({
    default: def,
    min: 5,
    max: 600,
    step: 5,
    label: { es: 'Profundidad', en: 'Depth' },
  });

export const mirror = defineItem({
  id: 'decor.mirror@1',
  category: 'decor',
  name: { es: 'Espejo', en: 'Mirror' },
  keywords: ['espejo', 'baño', 'muro'],
  mount: 'wall',
  defaultElevation: 1000,
  solid: false,
  params: {
    width: widthParam(600),
    depth: thinDepth(25),
    height: heightParam(900),
    frame: lengthParam({
      default: 30,
      min: 0,
      max: 200,
      step: 5,
      label: { es: 'Ancho de marco', en: 'Frame width' },
    }),
  },
  comfortMin: { width: 100, depth: 5, height: 100 },
  build: (p) => {
    const f = Math.min(p.frame, p.width / 4, p.height / 4);
    const z: [number, number] = [-p.depth / 2, p.depth / 2];
    const x: [number, number] = [-p.width / 2, p.width / 2];
    const parts: Part[] = [
      span('mirror', [x[0] + f, x[1] - f], [f, p.height - f], [z[1] - 4, z[1]]),
    ];
    if (f > 0) {
      parts.push(
        span('frame', x, [0, f], z),
        span('frame', x, [p.height - f, p.height], z),
        span('frame', [x[0], x[0] + f], [f, p.height - f], z),
        span('frame', [x[1] - f, x[1]], [f, p.height - f], z),
      );
    }
    parts.push(span('frame', [x[0] + f, x[1] - f], [f, p.height - f], [z[0], z[1] - 4]));
    return parts;
  },
});

export const plant = defineItem({
  id: 'decor.plant@1',
  category: 'decor',
  name: { es: 'Planta en macetero', en: 'Potted plant' },
  keywords: ['planta', 'macetero', 'verde', 'árbol'],
  mount: 'floor',
  solid: false,
  params: {
    diameter: lengthParam({
      default: 500,
      min: 50,
      max: 3000,
      step: 10,
      label: { es: 'Diámetro del follaje', en: 'Foliage diameter' },
    }),
    height: heightParam(1200),
    pot: colorOf('#c9b8a5', 'Color del macetero', 'Pot color'),
    leaves: colorOf('#4f7a45', 'Color del follaje', 'Foliage color'),
  },
  comfortMin: { width: 300, depth: 300, height: 400 },
  envelope: (p) => ({ width: p.diameter, depth: p.diameter, height: p.height }),
  build: (p) => {
    const r = p.diameter / 2;
    const potH = Math.min(p.height * 0.28, 450);
    const potR = Math.min(r * 0.55, 260);
    const foliage = p.height - potH;
    // Tres conos superpuestos: una silueta de follaje simple pero reconocible.
    const cones = [0, 1, 2].map((i) => {
      const h = foliage * (0.55 - i * 0.08);
      const base = potH + foliage * (i * 0.24);
      return tinted(
        cylinder('leaf', r * (1 - i * 0.22), h, [0, base + h / 2, 0], r * 0.05),
        p.leaves,
      );
    });
    return [
      tinted(cylinder('ceramic', potR, potH, [0, potH / 2, 0], potR * 1.12), p.pot),
      cylinder('wood', Math.max(8, r * 0.04), foliage * 0.3, [0, potH + foliage * 0.15, 0]),
      ...cones,
      // Remate superior: el follaje llega al alto indicado.
      tinted(
        cylinder('leaf', r * 0.3, foliage * 0.2, [0, p.height - foliage * 0.1, 0], r * 0.02),
        p.leaves,
      ),
    ];
  },
});

export const rug = defineItem({
  id: 'decor.rug@1',
  category: 'decor',
  name: { es: 'Alfombra', en: 'Rug' },
  keywords: ['alfombra', 'tapete', 'living'],
  mount: 'floor',
  solid: false,
  params: {
    width: widthParam(2000),
    depth: depthParam(1400),
    height: lengthParam({
      default: 10,
      min: 2,
      max: 60,
      step: 1,
      label: { es: 'Espesor', en: 'Thickness' },
    }),
    color: colorOf('#b9a58c'),
    border: colorOf('#8c7a64', 'Color del borde', 'Border color'),
  },
  comfortMin: { width: 100, depth: 100, height: 2 },
  presets: [
    { name: { es: '160 × 230' }, params: { width: 1600, depth: 2300 } },
    { name: { es: '200 × 300' }, params: { width: 2000, depth: 3000 } },
    { name: { es: 'Pasillo 70 × 250' }, params: { width: 700, depth: 2500 } },
  ],
  build: (p) => {
    const b = Math.min(80, p.width / 6, p.depth / 6);
    const x: [number, number] = [-p.width / 2, p.width / 2];
    const z: [number, number] = [-p.depth / 2, p.depth / 2];
    return [
      tinted(span('rug', x, [0, p.height * 0.98], z), p.border),
      tinted(
        span('rug', [x[0] + b, x[1] - b], [p.height * 0.98, p.height], [z[0] + b, z[1] - b]),
        p.color,
      ),
    ];
  },
});

export const curtain = defineItem({
  id: 'decor.curtain@1',
  category: 'decor',
  name: { es: 'Cortinas', en: 'Curtains' },
  keywords: ['cortina', 'ventana', 'visillo'],
  mount: 'wall',
  defaultElevation: 0,
  solid: false,
  params: {
    width: widthParam(1800),
    depth: thinDepth(140),
    height: heightParam(2300),
    folds: countParam(8, 30, { es: 'Pliegues', en: 'Folds' }),
    color: colorOf('#e8e1d6'),
  },
  comfortMin: { width: 300, depth: 40, height: 300 },
  build: (p) => {
    const rod = 30;
    const fold = p.width / p.folds;
    // Barra a lo ancho (los cilindros del catálogo son verticales: se usa una caja delgada).
    const parts: Part[] = [
      span(
        'metal',
        [-p.width / 2, p.width / 2],
        [p.height - rod, p.height],
        [-p.depth / 2, -p.depth / 2 + rod],
      ),
    ];
    for (let i = 0; i < p.folds; i++) {
      const front = i % 2 === 0;
      const x0 = -p.width / 2 + i * fold;
      parts.push(
        tinted(
          span(
            'fabric',
            [x0, x0 + fold],
            [0, p.height - rod],
            front ? [p.depth / 2 - 30, p.depth / 2] : [p.depth / 2 - 70, p.depth / 2 - 40],
          ),
          p.color,
        ),
      );
    }
    return parts;
  },
});

export const wallShelf = defineItem({
  id: 'decor.wall-shelf@1',
  category: 'decor',
  name: { es: 'Repisa de muro', en: 'Wall shelf' },
  keywords: ['repisa', 'estante flotante', 'muro'],
  mount: 'wall',
  defaultElevation: 1400,
  solid: false,
  params: {
    width: widthParam(800),
    depth: thinDepth(220),
    height: lengthParam({
      default: 30,
      min: 10,
      max: 400,
      step: 5,
      label: { es: 'Grosor', en: 'Thickness' },
    }),
  },
  comfortMin: { width: 100, depth: 50, height: 10 },
  build: (p) => [
    span('wood', [-p.width / 2, p.width / 2], [0, p.height], [-p.depth / 2, p.depth / 2]),
  ],
});

export const picture = defineItem({
  id: 'decor.picture@1',
  category: 'decor',
  name: { es: 'Cuadro', en: 'Picture' },
  keywords: ['cuadro', 'foto', 'lámina', 'arte', 'imagen'],
  mount: 'wall',
  defaultElevation: 1200,
  solid: false,
  params: {
    image: imageParam({ label: { es: 'Imagen', en: 'Image' } }),
    width: widthParam(600),
    depth: thinDepth(30),
    height: heightParam(450),
    frame: lengthParam({
      default: 25,
      min: 0,
      max: 200,
      step: 5,
      label: { es: 'Ancho de marco', en: 'Frame width' },
    }),
    mat: lengthParam({
      default: 40,
      min: 0,
      max: 300,
      step: 5,
      label: { es: 'Paspartú', en: 'Mat width' },
    }),
    frameColor: colorOf('#2b2724', 'Color del marco', 'Frame color'),
    matColor: colorOf('#f4f1ea', 'Color del paspartú', 'Mat color'),
  },
  comfortMin: { width: 100, depth: 5, height: 100 },
  build: (p) => {
    const f = Math.min(p.frame, p.width / 4, p.height / 4);
    const m = Math.min(p.mat, (p.width - 2 * f) / 3, (p.height - 2 * f) / 3);
    const x: [number, number] = [-p.width / 2, p.width / 2];
    const z: [number, number] = [-p.depth / 2, p.depth / 2];
    // Con marco, la imagen queda 3 mm detrás de su frente; sin marco, al frente.
    const front = f > 0 ? z[1] - 3 : z[1];
    const parts: Part[] = [
      // Fondo y paspartú; la imagen va encima, a ras del frente del marco.
      tinted(span('mat', [x[0] + f, x[1] - f], [f, p.height - f], [z[0], front - 1]), p.matColor),
      span('picture', [x[0] + f + m, x[1] - f - m], [f + m, p.height - f - m], [front - 1, front]),
    ];
    if (f > 0) {
      parts.push(
        ...[
          span('frame', x, [0, f], z),
          span('frame', x, [p.height - f, p.height], z),
          span('frame', [x[0], x[0] + f], [f, p.height - f], z),
          span('frame', [x[1] - f, x[1]], [f, p.height - f], z),
        ].map((part) => tinted(part, p.frameColor)),
      );
    }
    return parts;
  },
});
