import { cylinder, defineItem, lengthParam, type Part } from '@decodeny/domain';
import {
  clamp,
  countParam,
  depthParam,
  handParam,
  handSign,
  heightParam,
  legs,
  span,
  widthParam,
} from './shared';

const seatHeightParam = (def: number) =>
  lengthParam({
    default: def,
    min: 100,
    max: 1500,
    step: 10,
    advanced: true,
    label: { es: 'Altura del asiento', en: 'Seat height' },
  });

export const chairDining = defineItem({
  id: 'furniture.chair-dining@1',
  category: 'chair',
  name: { es: 'Silla de comedor', en: 'Dining chair' },
  keywords: ['silla', 'comedor'],
  mount: 'floor',
  comfortMin: { width: 380, depth: 420, height: 700 },
  params: {
    width: widthParam(450),
    depth: depthParam(520),
    height: heightParam(880),
    seat: seatHeightParam(460),
  },
  build: (p) => {
    const seat = clamp(p.seat, 250, p.height - 150);
    const x: [number, number] = [-p.width / 2, p.width / 2];
    return [
      ...legs(p.width, p.depth, seat - 40, 38, 10),
      span('fabric', x, [seat - 40, seat], [-p.depth / 2, p.depth / 2]),
      span('wood', x, [seat, p.height], [-p.depth / 2, -p.depth / 2 + 30]),
    ];
  },
  affordances: (p) => [{ kind: 'sit', at: [0, clamp(p.seat, 250, p.height - 150), 40] }],
});

export const chairOffice = defineItem({
  id: 'furniture.chair-office@1',
  category: 'chair',
  name: { es: 'Silla de escritorio', en: 'Office chair' },
  keywords: ['silla', 'oficina', 'escritorio'],
  mount: 'floor',
  comfortMin: { width: 500, depth: 500, height: 850 },
  params: {
    width: widthParam(620),
    depth: depthParam(620),
    height: heightParam(1050),
    seat: seatHeightParam(480),
  },
  build: (p) => {
    const seat = clamp(p.seat, 250, p.height - 300);
    const w = p.width / 2;
    const d = p.depth / 2;
    return [
      // Base en cruz (simplificación de la estrella de 5 brazos).
      span('black', [-w, w], [0, 40], [-30, 30]),
      span('black', [-30, 30], [0, 40], [-d, d]),
      cylinder('chrome', 25, seat - 110, [0, 40 + (seat - 110) / 2, 0]),
      span('fabric', [-w * 0.8, w * 0.8], [seat - 70, seat], [-d * 0.75, d * 0.85]),
      span('fabric', [-w * 0.7, w * 0.7], [seat + 60, p.height], [-d * 0.85, -d * 0.85 + 60]),
      span('black', [-25, 25], [seat - 70, seat + 60], [-d * 0.85 + 10, -d * 0.85 + 40]),
    ];
  },
  affordances: (p) => [{ kind: 'sit', at: [0, clamp(p.seat, 250, p.height - 300), 0] }],
});

interface SofaShape {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly seat: number;
  readonly seats: number;
  readonly arm: number;
}

/** Altura de asiento utilizable para un sofá de ese alto. */
const sofaSeat = (seat: number, height: number) => clamp(seat, 250, height - 100);

/** Sofá recto: base, cojines de asiento, respaldo y brazos. */
function sofaParts(shape: SofaShape, z0: number): Part[] {
  const s = { ...shape, seat: sofaSeat(shape.seat, shape.height) };
  const back = Math.min(220, s.depth * 0.3);
  const armHeight = Math.min(s.seat + 200, s.height);
  const inner: [number, number] = [-s.width / 2 + s.arm, s.width / 2 - s.arm];
  const z: [number, number] = [z0, z0 + s.depth];
  const parts: Part[] = [
    span('fabric', [-s.width / 2, s.width / 2], [0, s.seat - 120], z),
    span('fabric', inner, [s.seat - 120, s.height], [z[0], z[0] + back]),
    span('fabric', [-s.width / 2, inner[0]], [0, armHeight], z),
    span('fabric', [inner[1], s.width / 2], [0, armHeight], z),
  ];
  const cushion = (inner[1] - inner[0]) / s.seats;
  for (let i = 0; i < s.seats; i++) {
    const x0 = inner[0] + i * cushion;
    parts.push(
      span('cushion', [x0 + 5, x0 + cushion - 5], [s.seat - 120, s.seat], [z[0] + back, z[1]]),
    );
  }
  return parts;
}

const sofaParams = (width: number, seats: number) => ({
  width: widthParam(width),
  depth: depthParam(900),
  height: heightParam(850),
  seats: countParam(seats, 10, { es: 'Cuerpos', en: 'Seats' }),
  seat: seatHeightParam(430),
  arm: lengthParam({
    default: 200,
    min: 20,
    max: 1000,
    step: 10,
    advanced: true,
    label: { es: 'Ancho de brazos', en: 'Arm width' },
  }),
});

export const sofaStraight = defineItem({
  id: 'furniture.sofa@1',
  category: 'sofa',
  name: { es: 'Sofá', en: 'Sofa' },
  keywords: ['sillón', 'living', 'cuerpos'],
  mount: 'floor',
  comfortMin: { width: 700, depth: 700, height: 650 },
  params: sofaParams(2000, 3),
  presets: [
    { name: { es: '2 cuerpos · 160' }, params: { width: 1600, seats: 2 } },
    { name: { es: '3 cuerpos · 210' }, params: { width: 2100, seats: 3 } },
    { name: { es: '4 cuerpos · 260' }, params: { width: 2600, seats: 4 } },
  ],
  build: (p) => sofaParts({ ...p, arm: Math.min(p.arm, p.width / 4) }, -p.depth / 2),
  affordances: (p) =>
    Array.from({ length: p.seats }, (_, i) => ({
      kind: 'sit' as const,
      at: [
        -p.width / 2 + p.arm + ((p.width - 2 * p.arm) / p.seats) * (i + 0.5),
        sofaSeat(p.seat, p.height),
        100,
      ] as const,
    })),
});

export const armchair = defineItem({
  id: 'furniture.armchair@1',
  category: 'sofa',
  name: { es: 'Sillón', en: 'Armchair' },
  keywords: ['butaca', 'poltrona', 'living'],
  mount: 'floor',
  comfortMin: { width: 600, depth: 650, height: 650 },
  params: {
    width: widthParam(850),
    depth: depthParam(850),
    height: heightParam(850),
    seat: seatHeightParam(430),
  },
  build: (p) => sofaParts({ ...p, seats: 1, arm: Math.min(180, p.width / 4) }, -p.depth / 2),
  affordances: (p) => [{ kind: 'sit', at: [0, sofaSeat(p.seat, p.height), 100] }],
});

export const sofaL = defineItem({
  id: 'furniture.sofa-l@1',
  category: 'sofa',
  name: { es: 'Sofá en L', en: 'L-shaped sofa' },
  keywords: ['esquinero', 'chaise', 'seccional'],
  mount: 'floor',
  comfortMin: { width: 1800, depth: 1200, height: 650 },
  params: {
    width: widthParam(2700),
    depth: depthParam(1600, { es: 'Fondo total (con chaise)', en: 'Total depth' }),
    height: heightParam(850),
    chaise: handParam({ es: 'Chaise longue a la', en: 'Chaise on the' }),
    seat: seatHeightParam(430),
  },
  build: (p) => {
    const main = Math.min(900, p.depth - 300);
    const seat = sofaSeat(p.seat, p.height);
    const chaiseWidth = Math.min(900, p.width / 2);
    const side = handSign(p.chaise);
    const x0 = side > 0 ? p.width / 2 - chaiseWidth : -p.width / 2;
    return [
      ...sofaParts(
        { width: p.width, depth: main, height: p.height, seat, seats: 3, arm: 180 },
        -p.depth / 2,
      ),
      span('fabric', [x0, x0 + chaiseWidth], [0, seat - 120], [-p.depth / 2 + main, p.depth / 2]),
      span(
        'cushion',
        [x0 + 5, x0 + chaiseWidth - 5],
        [seat - 120, seat],
        [-p.depth / 2 + main, p.depth / 2],
      ),
    ];
  },
  affordances: (p) => [
    { kind: 'sit', at: [0, sofaSeat(p.seat, p.height), -p.depth / 2 + 500] },
    {
      kind: 'lie',
      at: [handSign(p.chaise) * (p.width / 2 - 450), sofaSeat(p.seat, p.height), p.depth / 2 - 500],
    },
  ],
});
