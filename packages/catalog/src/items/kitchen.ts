import { booleanParam, cylinder, defineItem, type Part } from '@decodeny/domain';
import { depthParam, heightParam, span, widthParam } from './shared';

export const kitchenCounter = defineItem({
  id: 'kitchen.counter@1',
  category: 'kitchen',
  name: { es: 'Mueble de cocina', en: 'Kitchen counter' },
  keywords: ['cubierta', 'mesón', 'muebles bajos', 'lavaplatos', 'encimera'],
  mount: 'floor',
  comfortMin: { width: 400, depth: 500, height: 800 },
  params: {
    width: widthParam(2400),
    depth: depthParam(600),
    height: heightParam(900),
    sink: booleanParam({ default: true, label: { es: 'Con lavaplatos', en: 'With sink' } }),
    cooktop: booleanParam({ default: true, label: { es: 'Con encimera', en: 'With cooktop' } }),
  },
  build: (p) => {
    const top = 40;
    const plinth = 100;
    // Lavaplatos y encimera sobresalen 3 mm de la cubierta: sin caras coplanares (z-fighting).
    const inlay = 3;
    const front = p.depth / 2;
    const x: [number, number] = [-p.width / 2, p.width / 2];
    const modules = Math.max(1, Math.round(p.width / 600));
    const module = (p.width - 4 * (modules + 1)) / modules;
    const parts: Part[] = [
      span('stone', x, [p.height - top, p.height - inlay], [-p.depth / 2, front]),
      span('stone', x, [p.height - inlay, p.height], [-p.depth / 2, -p.depth / 2 + 15]),
      span('lacquer', x, [plinth, p.height - top], [-p.depth / 2, front - 40]),
      span('dark', x, [0, plinth], [-p.depth / 2, front - 60]),
      ...Array.from({ length: modules }, (_, i) => {
        const x0 = x[0] + 4 + i * (module + 4);
        return [
          span(
            'lacquer',
            [x0, x0 + module],
            [plinth + 4, p.height - top - 4],
            [front - 40, front - 22],
          ),
          span(
            'metal',
            [x0 + 40, x0 + Math.min(module - 40, 200)],
            [p.height - top - 60, p.height - top - 44],
            [front - 22, front - 8],
          ),
        ];
      }).flat(),
    ];
    if (p.sink && p.width >= 900) {
      parts.push(
        span(
          'basin',
          [x[0] + 150, x[0] + 650],
          [p.height - inlay, p.height],
          [-p.depth / 2 + 100, front - 80],
        ),
      );
      parts.push(cylinder('chrome', 15, 60, [x[0] + 400, p.height - 30, -p.depth / 2 + 60]));
    }
    if (p.cooktop && p.width >= 1500) {
      parts.push(
        span(
          'black',
          [x[1] - 750, x[1] - 150],
          [p.height - inlay, p.height],
          [-p.depth / 2 + 60, front - 60],
        ),
      );
    }
    return parts;
  },
});

export const fridge = defineItem({
  id: 'kitchen.fridge@1',
  category: 'kitchen',
  name: { es: 'Refrigerador', en: 'Refrigerator' },
  keywords: ['refri', 'heladera', 'nevera', 'frigorífico'],
  mount: 'floor',
  comfortMin: { width: 500, depth: 550, height: 1200 },
  params: {
    width: widthParam(600),
    depth: depthParam(650),
    height: heightParam(1800),
  },
  build: (p) => {
    const front = p.depth / 2;
    const split = p.height * 0.62;
    const x: [number, number] = [-p.width / 2, p.width / 2];
    return [
      span('steel', x, [0, p.height], [-p.depth / 2, front - 40]),
      span('steel', [x[0] + 3, x[1] - 3], [20, split - 6], [front - 40, front - 15]),
      span('steel', [x[0] + 3, x[1] - 3], [split, p.height - 3], [front - 40, front - 15]),
      span('chrome', [x[1] - 60, x[1] - 40], [split - 400, split - 100], [front - 15, front]),
      span('chrome', [x[1] - 60, x[1] - 40], [split + 100, split + 400], [front - 15, front]),
    ];
  },
});
