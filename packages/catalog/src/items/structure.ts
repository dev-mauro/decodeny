import {
  defineItem,
  lengthParam,
  type CollisionBox,
  type LocalizedText,
  type Part,
  type PlanStroke,
} from '@decodeny/domain';
import { countParam, span } from './shared';
import { guardCollider, guardRail, insetRect, partsEnvelope, POST, type P2 } from './stairs';

/**
 * Elementos que atraviesan losas (I12, junto a las escaleras): el vacío de una doble altura y el
 * ascensor. Como las escaleras, declaran el hueco que abren (`floorOpening`) y su colisión.
 */

const label = (es: string, en: string): LocalizedText => ({ es, en });

const storeyHeightParam = lengthParam({
  default: 2800,
  min: 1000,
  max: 40_000,
  step: 10,
  label: label('Alto de piso a piso', 'Floor-to-floor height'),
});

/** Rectángulo centrado (marco local) como polígono. */
const rectangle = (width: number, depth: number): P2[] =>
  insetRect([-width / 2, width / 2], [-depth / 2, depth / 2], 0);

/** Las dos diagonales de un rectángulo centrado (símbolo de vacío y de ascensor). */
const cross = (width: number, z0: number, z1: number, dashed: boolean): PlanStroke[] => [
  {
    points: [
      [-width / 2, z0],
      [width / 2, z1],
    ],
    dashed,
  },
  {
    points: [
      [width / 2, z0],
      [-width / 2, z1],
    ],
    dashed,
  },
];

// --- Vacío ------------------------------------------------------------------------------------

interface VoidParams {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/** Barandas alrededor del vacío, en el piso de arriba. */
function voidGuards(p: VoidParams): [P2, P2][] {
  const line = insetRect([-p.width / 2, p.width / 2], [-p.depth / 2, p.depth / 2], POST / 2);
  return line.map((a, i) => [a, line[(i + 1) % line.length]!]);
}

const voidParts = (p: VoidParams): Part[] =>
  voidGuards(p).flatMap(([a, b]) => guardRail(a, b, p.height));

/**
 * Vacío de doble altura: un hueco en la losa de arriba con barandas alrededor (en el piso de
 * arriba). En su planta no tiene cuerpo: solo se ve el espacio que deja.
 */
export const structureVoid = defineItem({
  id: 'structure.void@1',
  category: 'stairs',
  name: label('Vacío (doble altura)', 'Double-height void'),
  keywords: ['doble altura', 'hueco', 'altillo', 'mezzanine', 'vacio'],
  mount: 'floor',
  fillsStorey: true,
  params: {
    width: lengthParam({
      default: 2000,
      min: 500,
      max: 20_000,
      step: 10,
      label: label('Ancho', 'Width'),
    }),
    depth: lengthParam({
      default: 2000,
      min: 500,
      max: 20_000,
      step: 10,
      label: label('Profundidad', 'Depth'),
    }),
    height: storeyHeightParam,
  },
  envelope: (p) => ({ ...partsEnvelope(voidParts(p)), width: p.width, depth: p.depth }),
  build: voidParts,
  colliders: (p) => voidGuards(p).map(([a, b]) => guardCollider(a, b, p.height)),
  floorOpening: (p) => rectangle(p.width, p.depth),
  planOutline: (p) => rectangle(p.width, p.depth),
  planSymbol: (p) => cross(p.width, -p.depth / 2, p.depth / 2, true),
});

// --- Ascensor ---------------------------------------------------------------------------------

/** Pilares y techo del ducto. */
const FRAME = 60;
/** Alto libre de la cabina sobre la última parada. */
const CABIN_HEIGHT = 2400;
const GLASS = 12;

/** Terminación del ascensor: ducto y puertas de vidrio o de metal. */
export type ElevatorFinish = 'glass' | 'metal';

/** Puertas correderas de cada parada y alto libre de la cabina (los dibuja y anima el visor). */
export const ELEVATOR_DOOR = {
  height: 2100,
  thickness: 40,
  cabin: CABIN_HEIGHT,
  frame: FRAME,
} as const;

interface ElevatorParams {
  readonly width: number;
  readonly depth: number;
  readonly stops: number;
  readonly height: number;
}

/**
 * Ducto del ascensor (marco local; se entra por el frente, +z): pilares en las esquinas, paños
 * a los costados y al fondo y techo sobre la última parada. La plataforma que sube, su botonera
 * y las puertas correderas de cada parada las dibuja el visor (se mueven en el recorrido).
 */
function elevatorShaft(p: ElevatorParams, finish: ElevatorFinish) {
  const x: P2 = [-p.width / 2 - FRAME, p.width / 2 + FRAME];
  const depth = p.depth + FRAME;
  const z: P2 = [-depth / 2, depth / 2];
  const top = p.height + CABIN_HEIGHT;
  const slot = finish === 'glass' ? 'glass' : 'steel';
  const panel = finish === 'glass' ? GLASS : FRAME;
  const parts: Part[] = [
    ...[
      [x[0], z[0]],
      [x[1] - FRAME, z[0]],
      [x[0], z[1] - FRAME],
      [x[1] - FRAME, z[1] - FRAME],
    ].map(([px, pz]) => span('metal', [px!, px! + FRAME], [0, top], [pz!, pz! + FRAME])),
    // Paños: fondo y costados, entre los pilares.
    span(
      slot,
      [x[0] + FRAME, x[1] - FRAME],
      [0, top - FRAME],
      [z[0] + FRAME / 2 - panel / 2, z[0] + FRAME / 2 + panel / 2],
    ),
    span(
      slot,
      [x[0] + FRAME / 2 - panel / 2, x[0] + FRAME / 2 + panel / 2],
      [0, top - FRAME],
      [z[0] + FRAME, z[1] - FRAME],
    ),
    span(
      slot,
      [x[1] - FRAME / 2 - panel / 2, x[1] - FRAME / 2 + panel / 2],
      [0, top - FRAME],
      [z[0] + FRAME, z[1] - FRAME],
    ),
    span('metal', x, [top - FRAME, top], z),
  ];
  const colliders: CollisionBox[] = [
    { size: [x[1] - x[0], top, FRAME], at: [0, top / 2, z[0] + FRAME / 2] },
    { size: [FRAME, top, depth], at: [x[0] + FRAME / 2, top / 2, 0] },
    { size: [FRAME, top, depth], at: [x[1] - FRAME / 2, top / 2, 0] },
  ];
  // La cabina: el interior del ducto.
  const cabin: P2[] = insetRect([-p.width / 2, p.width / 2], [z[0] + FRAME, z[1]], 0);
  return { parts, colliders, cabin, cabinZ: (z[0] + FRAME + z[1]) / 2 };
}

const elevatorDefinition = (id: string, name: LocalizedText, finish: ElevatorFinish) =>
  defineItem({
    id,
    category: 'stairs',
    name,
    keywords: ['ascensor', 'elevador', 'lift', finish === 'glass' ? 'vidrio' : 'metal'],
    mount: 'floor',
    fillsStorey: true,
    params: {
      width: lengthParam({
        default: 1100,
        min: 800,
        max: 3000,
        step: 10,
        label: label('Ancho de la cabina', 'Car width'),
      }),
      depth: lengthParam({
        default: 1400,
        min: 800,
        max: 3000,
        step: 10,
        label: label('Fondo de la cabina', 'Car depth'),
      }),
      stops: countParam(2, 10, label('Paradas', 'Stops')),
      height: storeyHeightParam,
    },
    envelope: (p) => partsEnvelope(elevatorShaft(p, finish).parts),
    build: (p) => elevatorShaft(p, finish).parts,
    colliders: (p) => elevatorShaft(p, finish).colliders,
    floorOpening: (p) => elevatorShaft(p, finish).cabin,
    openingSpan: (p) => Math.max(1, p.stops - 1),
    planSymbol: (p) => {
      const { cabin } = elevatorShaft(p, finish);
      return [
        ...cross(p.width, cabin[0]![1], cabin[2]![1], false),
        // La puerta, al frente.
        {
          points: [
            [-p.width / 2, cabin[0]![1]],
            [p.width / 2, cabin[0]![1]],
          ],
        },
      ];
    },
    affordances: (p) => [{ kind: 'travel', at: [0, 0, elevatorShaft(p, finish).cabinZ] }],
  });

export const elevator = elevatorDefinition(
  'structure.elevator@1',
  label('Ascensor de vidrio', 'Glass elevator'),
  'glass',
);
export const elevatorMetal = elevatorDefinition(
  'structure.elevator-metal@1',
  label('Ascensor de metal', 'Metal elevator'),
  'metal',
);

/** Terminación de un ascensor del catálogo (para sus puertas y botonera). */
export const elevatorFinish = (def: string): ElevatorFinish =>
  def === elevatorMetal.id ? 'metal' : 'glass';
