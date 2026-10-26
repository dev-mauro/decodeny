import { defineItem, lengthParam } from '@decodeny/domain';
import { clamp, depthParam, drawerFronts, heightParam, legs, span, widthParam } from './shared';

export const bed = defineItem({
  id: 'furniture.bed@1',
  category: 'bed',
  name: { es: 'Cama', en: 'Bed' },
  keywords: ['plaza', 'plazas', 'king', 'queen', 'dormitorio', 'colchón'],
  mount: 'floor',
  comfortMin: { width: 800, depth: 1800, height: 600 },
  params: {
    width: widthParam(1400),
    depth: depthParam(2000, { es: 'Largo', en: 'Length' }),
    height: heightParam(1000),
    mattress: lengthParam({
      default: 550,
      min: 100,
      max: 1500,
      step: 10,
      advanced: true,
      label: { es: 'Altura del colchón', en: 'Mattress height' },
    }),
  },
  presets: [
    { name: { es: '1 plaza · 90 × 190' }, params: { width: 900, depth: 1900 } },
    { name: { es: '1½ plazas · 105 × 190' }, params: { width: 1050, depth: 1900 } },
    { name: { es: '2 plazas · 140 × 190' }, params: { width: 1400, depth: 1900 } },
    { name: { es: 'Queen · 160 × 200' }, params: { width: 1600, depth: 2000 } },
    { name: { es: 'King · 180 × 200' }, params: { width: 1800, depth: 2000 } },
  ],
  build: (p) => {
    const head = 70;
    // La almohada (120 mm sobre el colchón) nunca supera el respaldo.
    const mattress = clamp(p.mattress, 350, p.height - 130);
    const x: [number, number] = [-p.width / 2, p.width / 2];
    const z0 = -p.depth / 2 + head;
    const pillows = p.width >= 1300 ? 2 : 1;
    const pillowWidth = (p.width - 120) / pillows;
    return [
      span('wood', x, [0, p.height], [-p.depth / 2, z0]),
      span('wood', x, [120, mattress - 220], [z0, p.depth / 2]),
      ...legs(p.width, p.depth - head, 120, 60, 30).map((l) => ({
        ...l,
        at: [l.at[0], l.at[1], l.at[2] + head / 2] as const,
      })),
      span(
        'mattress',
        [x[0] + 15, x[1] - 15],
        [mattress - 220, mattress],
        [z0 + 10, p.depth / 2 - 10],
      ),
      span(
        'linen',
        [x[0] + 10, x[1] - 10],
        [mattress - 120, mattress + 10],
        [z0 + 450, p.depth / 2],
      ),
      ...Array.from({ length: pillows }, (_, i) =>
        span(
          'pillow',
          [x[0] + 60 + i * pillowWidth + 15, x[0] + 60 + (i + 1) * pillowWidth - 15],
          [mattress, mattress + 120],
          [z0 + 40, z0 + 400],
        ),
      ),
    ];
  },
  affordances: (p) => [{ kind: 'lie', at: [0, clamp(p.mattress, 350, p.height - 130), 0] }],
});

export const nightstand = defineItem({
  id: 'furniture.nightstand@1',
  category: 'bed',
  name: { es: 'Velador', en: 'Nightstand' },
  keywords: ['mesa de noche', 'mesita', 'veladora'],
  mount: 'floor',
  comfortMin: { width: 300, depth: 300, height: 400 },
  params: {
    width: widthParam(450),
    depth: depthParam(400),
    height: heightParam(550),
  },
  build: (p) => {
    const x: [number, number] = [-p.width / 2, p.width / 2];
    return [
      span('wood', x, [80, p.height], [-p.depth / 2, p.depth / 2 - 20]),
      ...legs(p.width, p.depth - 20, 80, 40, 20).map((l) => ({
        ...l,
        at: [l.at[0], l.at[1], l.at[2] - 10] as const,
      })),
      ...drawerFronts(x, [80, p.height - 30], 2, p.depth),
    ];
  },
});
