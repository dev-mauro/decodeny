import {
  booleanParam,
  cylinder,
  defineItem,
  lengthParam,
  numberParam,
  type LightEmitter,
} from '@decodeny/domain';
import { depthParam, heightParam, span, widthParam } from './shared';

/** Parámetros comunes de luminarias: encendido, flujo luminoso y temperatura de color. */
const lightParams = (lumens: number, kelvin = 3000) => ({
  on: booleanParam({ default: true, label: { es: 'Encendida', en: 'On' } }),
  lumens: numberParam({
    default: lumens,
    min: 50,
    max: 20_000,
    step: 50,
    label: { es: 'Flujo luminoso (lm)', en: 'Luminous flux (lm)' },
  }),
  kelvin: numberParam({
    default: kelvin,
    min: 1800,
    max: 6500,
    step: 100,
    label: { es: 'Temperatura de color (K)', en: 'Color temperature (K)' },
  }),
});

/** Las luminarias pueden ser muy delgadas (un foco embutido mide 2 cm de alto). */
const lampHeight = (def: number) =>
  lengthParam({
    default: def,
    min: 5,
    max: 3000,
    step: 5,
    label: { es: 'Alto', en: 'Height' },
  });

const diameterParam = (def: number) =>
  lengthParam({
    default: def,
    min: 30,
    max: 3000,
    step: 10,
    label: { es: 'Diámetro', en: 'Diameter' },
  });

const round = (p: { readonly diameter: number; readonly height: number }) => ({
  width: p.diameter,
  depth: p.diameter,
  height: p.height,
});

const emit = (
  p: { readonly on: boolean; readonly lumens: number; readonly kelvin: number },
  emitters: readonly Omit<LightEmitter, 'lumens' | 'kelvin'>[],
): LightEmitter[] =>
  p.on ? emitters.map((e) => ({ ...e, lumens: p.lumens / emitters.length, kelvin: p.kelvin })) : [];

export const recessedLight = defineItem({
  id: 'light.recessed@1',
  category: 'lighting',
  name: { es: 'Foco embutido', en: 'Recessed spotlight' },
  keywords: ['spot', 'downlight', 'cielo', 'led'],
  mount: 'ceiling',
  solid: false,
  params: {
    diameter: diameterParam(90),
    height: lampHeight(20),
    ...lightParams(600, 3000),
  },
  envelope: round,
  build: (p) => [
    cylinder('trim', p.diameter / 2, p.height * 0.4, [0, p.height * 0.8, 0]),
    cylinder('bulb', (p.diameter / 2) * 0.7, p.height * 0.6, [0, p.height * 0.3, 0]),
  ],
  emitters: (p) => emit(p, [{ kind: 'spot', at: [0, 0, 0], angle: 60 }]),
});

export const ceilingLight = defineItem({
  id: 'light.ceiling@1',
  category: 'lighting',
  name: { es: 'Plafón', en: 'Ceiling light' },
  keywords: ['lámpara de cielo', 'luminaria'],
  mount: 'ceiling',
  solid: false,
  params: {
    diameter: diameterParam(400),
    height: lampHeight(100),
    ...lightParams(1500),
  },
  envelope: round,
  build: (p) => [
    cylinder('trim', p.diameter / 2, p.height * 0.25, [0, p.height * 0.875, 0]),
    cylinder(
      'bulb',
      (p.diameter / 2) * 0.95,
      p.height * 0.75,
      [0, p.height * 0.375, 0],
      (p.diameter / 2) * 0.98,
    ),
  ],
  emitters: (p) => emit(p, [{ kind: 'point', at: [0, p.height * 0.3, 0] }]),
});

export const pendantLight = defineItem({
  id: 'light.pendant@1',
  category: 'lighting',
  name: { es: 'Lámpara colgante', en: 'Pendant lamp' },
  keywords: ['colgante', 'comedor', 'suspensión'],
  mount: 'ceiling',
  solid: false,
  params: {
    diameter: diameterParam(350),
    height: heightParam(800),
    ...lightParams(1000, 2700),
  },
  envelope: round,
  build: (p) => {
    const shade = Math.min(260, p.height * 0.6);
    return [
      // Pantalla cónica: ancha abajo, angosta arriba.
      cylinder('shade', p.diameter / 2, shade, [0, shade / 2, 0], (p.diameter / 2) * 0.35),
      cylinder('bulb', Math.min(40, p.diameter / 6), 60, [0, 40, 0]),
      cylinder('black', 4, p.height - shade - 20, [0, shade + (p.height - shade - 20) / 2, 0]),
      cylinder('trim', Math.min(60, p.diameter / 3), 20, [0, p.height - 10, 0]),
    ];
  },
  emitters: (p) => emit(p, [{ kind: 'point', at: [0, 60, 0] }]),
});

export const wallLight = defineItem({
  id: 'light.wall@1',
  category: 'lighting',
  name: { es: 'Aplique de muro', en: 'Wall sconce' },
  keywords: ['aplique', 'muro', 'pared'],
  mount: 'wall',
  defaultElevation: 1700,
  solid: false,
  params: {
    width: widthParam(160),
    depth: depthParam(120),
    height: heightParam(240),
    ...lightParams(500, 2700),
  },
  build: (p) => [
    span(
      'trim',
      [-p.width / 4, p.width / 4],
      [p.height * 0.2, p.height * 0.8],
      [-p.depth / 2, -p.depth / 2 + 15],
    ),
    span('shade', [-p.width / 2, p.width / 2], [0, p.height], [-p.depth / 2 + 15, p.depth / 2]),
  ],
  emitters: (p) => emit(p, [{ kind: 'point', at: [0, p.height / 2, p.depth / 2 + 30] }]),
});

export const floorLamp = defineItem({
  id: 'light.floor@1',
  category: 'lighting',
  name: { es: 'Lámpara de pie', en: 'Floor lamp' },
  keywords: ['pie', 'living', 'lectura'],
  mount: 'floor',
  params: {
    diameter: diameterParam(420),
    height: heightParam(1650),
    ...lightParams(1200, 2700),
  },
  envelope: round,
  build: (p) => {
    const shade = Math.min(320, p.height * 0.3);
    return [
      cylinder('black', Math.min(160, p.diameter / 2.6), 25, [0, 12.5, 0]),
      cylinder('metal', 12, p.height - shade - 25, [0, 25 + (p.height - shade - 25) / 2, 0]),
      cylinder(
        'shade',
        p.diameter / 2,
        shade,
        [0, p.height - shade / 2, 0],
        (p.diameter / 2) * 0.75,
      ),
    ];
  },
  emitters: (p) =>
    emit(p, [{ kind: 'point', at: [0, p.height - Math.min(320, p.height * 0.3) / 2, 0] }]),
});

export const tableLamp = defineItem({
  id: 'light.table@1',
  category: 'lighting',
  name: { es: 'Lámpara de mesa', en: 'Table lamp' },
  keywords: ['velador', 'escritorio', 'mesa'],
  mount: 'surface',
  defaultElevation: 750,
  solid: false,
  params: {
    diameter: diameterParam(300),
    height: heightParam(480),
    ...lightParams(450, 2700),
  },
  envelope: round,
  build: (p) => {
    const shade = Math.min(220, p.height * 0.45);
    return [
      cylinder(
        'ceramic',
        Math.min(70, p.diameter / 4),
        p.height - shade,
        [0, (p.height - shade) / 2, 0],
        Math.min(55, p.diameter / 5),
      ),
      cylinder(
        'shade',
        p.diameter / 2,
        shade,
        [0, p.height - shade / 2, 0],
        (p.diameter / 2) * 0.7,
      ),
    ];
  },
  emitters: (p) => emit(p, [{ kind: 'point', at: [0, p.height - 110, 0] }]),
});
