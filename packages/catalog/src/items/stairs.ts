import {
  bar,
  booleanParam,
  box,
  choiceParam,
  cylinder,
  defineItem,
  lengthParam,
  partsBounds,
  type BoxPart,
  type CollisionBox,
  type ItemEnvelope,
  type LocalizedText,
  type LocalPolygon,
  type Part,
  type PlanStroke,
  type Vec3Mm,
} from '@decodeny/domain';
import { span } from './shared';

/**
 * Escaleras (I12). Marco local como el de los muebles: se sube desde el frente (+z) hacia el
 * fondo. El alto (`height`) es de piso a piso: el último peldaño es el piso de la planta de
 * arriba, así que hay `n` contrahuellas y `n − 1` huellas. Cada escalera declara:
 *
 * - **colisión por rampas**: una caja inclinada por tramo que pasa por el centro de las huellas,
 *   para subir sin saltos (los descansos son cajas planas);
 * - **hueco en la losa** de arriba (`floorOpening`) y **barandas de protección** alrededor de ese
 *   hueco en la planta de arriba, salvo por donde se llega.
 */

const label = (es: string, en: string): LocalizedText => ({ es, en });

/** Contrahuella máxima (mm): el controlador del recorrido sube hasta 200 mm. */
const RISER_MAX = 180;
/** Regla de Blondel: 2 contrahuellas + 1 huella ≈ 63 cm. */
const BLONDEL = 630;
const TREAD = { min: 240, max: 320 } as const;
/** Alto del pasamanos sobre la huella y de las barandas sobre el piso de arriba. */
export const RAIL = 900;
export const POST = 40;
const BALUSTER = 20;
/** Espesor de la huella de madera sobre el cuerpo del peldaño. */
const CAP = 30;
/** Espesor de las rampas de colisión y ancho de las barandas como obstáculo. */
const RAMP_THICKNESS = 200;
const GUARD_THICKNESS = 100;

export interface StairSteps {
  /** Contrahuellas (la última llega al piso de arriba). */
  readonly count: number;
  readonly riser: number;
  readonly tread: number;
}

/** Peldaños para una altura de piso a piso: contrahuella ≤ `riserMax` y huella de Blondel. */
export function stairSteps(height: number, riserMax = RISER_MAX, even = false): StairSteps {
  let count = Math.max(2, Math.ceil(height / riserMax));
  if (even && count % 2 === 1) count += 1;
  const riser = height / count;
  const tread = Math.min(TREAD.max, Math.max(TREAD.min, BLONDEL - 2 * riser));
  return { count, riser, tread };
}

const heightParam = lengthParam({
  default: 2800,
  min: 1000,
  max: 6000,
  step: 10,
  label: label('Alto de piso a piso', 'Floor-to-floor height'),
});
const flightWidthParam = (def: number) =>
  lengthParam({ default: def, min: 600, max: 2000, step: 10, label: label('Ancho', 'Width') });
const railingParam = booleanParam({ default: true, label: label('Barandas', 'Railings') });
const turnParam = choiceParam({
  default: 'right',
  label: label('Gira hacia', 'Turns'),
  options: [
    { value: 'left', label: label('La izquierda', 'Left') },
    { value: 'right', label: label('La derecha', 'Right') },
  ],
});

// --- Utilidades geométricas -------------------------------------------------------------------

export type P2 = readonly [number, number];

/**
 * Caja de colisión cuya cara de arriba va de `from` a `to` (una rampa; plana si están a la misma
 * altura): `width` de través y `thickness` hacia abajo.
 */
export function ramp(from: Vec3Mm, to: Vec3Mm, width: number, thickness: number): CollisionBox {
  const axis = bar('', from, to, 1);
  const r = axis.rotationY ?? 0;
  const p = axis.pitch ?? 0;
  // La normal de la cara de arriba después de inclinar y girar (ver `BoxPart`).
  const up: Vec3Mm = [Math.sin(r) * Math.sin(p), Math.cos(p), Math.cos(r) * Math.sin(p)];
  const half = thickness / 2;
  return {
    size: [width, thickness, axis.size[2]],
    at: [axis.at[0] - up[0] * half, axis.at[1] - up[1] * half, axis.at[2] - up[2] * half],
    rotationY: r,
    pitch: p,
  };
}

/** Peldaño macizo: cuerpo blanco desde el piso y huella de madera arriba. */
function block(x: P2, z: P2, top: number): Part[] {
  return [span('lacquer', x, [0, top - CAP], z), span('wood', x, [top - CAP, top], z)];
}

/** Tramo recto de peldaños en una dirección de los ejes. */
interface Flight {
  /** Centro del borde donde empieza la primera huella. */
  readonly start: P2;
  /** Sentido de subida (un eje: [0, −1], [1, 0]…). */
  readonly dir: P2;
  readonly width: number;
  /** Índice del primer peldaño: su huella queda a `first · riser`. */
  readonly first: number;
  readonly count: number;
}

const along = (f: Flight, t: number, across = 0): P2 => [
  f.start[0] + f.dir[0] * t - f.dir[1] * across,
  f.start[1] + f.dir[1] * t + f.dir[0] * across,
];

function rect(a: P2, b: P2): { x: P2; z: P2 } {
  return {
    x: [Math.min(a[0], b[0]), Math.max(a[0], b[0])],
    z: [Math.min(a[1], b[1]), Math.max(a[1], b[1])],
  };
}

function flightBlocks(f: Flight, s: StairSteps): Part[] {
  const parts: Part[] = [];
  for (let j = 0; j < f.count; j++) {
    const r = rect(along(f, j * s.tread, -f.width / 2), along(f, (j + 1) * s.tread, f.width / 2));
    parts.push(...block(r.x, r.z, (f.first + j) * s.riser));
  }
  return parts;
}

/** Rampa que pasa por el centro de las huellas, de medio peldaño antes a medio después. */
function flightRamp(f: Flight, s: StairSteps): CollisionBox {
  const a = along(f, -s.tread / 2);
  const b = along(f, (f.count + 0.5) * s.tread);
  return ramp(
    [a[0], (f.first - 1) * s.riser, a[1]],
    [b[0], (f.first + f.count) * s.riser, b[1]],
    f.width,
    RAMP_THICKNESS,
  );
}

/** Pasamanos a ambos lados de un tramo: pilares en los extremos, barrotes y barra inclinada. */
function flightRails(f: Flight, s: StairSteps): Part[] {
  if (f.count === 0) return [];
  const parts: Part[] = [];
  for (const side of [-1, 1]) {
    const across = side * (f.width / 2 - POST / 2);
    const mid = (j: number) => along(f, (j + 0.5) * s.tread, across);
    const top = (j: number) => (f.first + j) * s.riser;
    for (let j = 0; j < f.count; j++) {
      const [x, z] = mid(j);
      const end = j === 0 || j === f.count - 1;
      const size = end ? POST : BALUSTER;
      parts.push(
        box(
          'black',
          [size, RAIL - (end ? 0 : POST), size],
          [x, top(j) + (RAIL - (end ? 0 : POST)) / 2, z],
        ),
      );
    }
    if (f.count > 1) {
      const [x0, z0] = mid(0);
      const [x1, z1] = mid(f.count - 1);
      parts.push(
        bar(
          'black',
          [x0, top(0) + RAIL - POST / 2, z0],
          [x1, top(f.count - 1) + RAIL - POST / 2, z1],
          POST,
        ),
      );
    }
  }
  return parts;
}

/**
 * Barandas de un tramo como obstáculo: a cada lado, una caja vertical por peldaño (una pared
 * inclinada tendría los extremos sesgados y estorbaría el paso al descanso).
 */
function flightRailColliders(f: Flight, s: StairSteps): CollisionBox[] {
  const rotationY = Math.atan2(-f.dir[0], -f.dir[1]);
  return [-1, 1].flatMap((side) =>
    Array.from({ length: f.count }, (_, j): CollisionBox => {
      const [x, z] = along(f, (j + 0.5) * s.tread, side * (f.width / 2 - POST / 2));
      const top = (f.first + j) * s.riser;
      return {
        size: [GUARD_THICKNESS, RAIL + RAMP_THICKNESS, s.tread],
        at: [x, top + (RAIL - RAMP_THICKNESS) / 2, z],
        rotationY,
      };
    }),
  );
}

/** Baranda horizontal de `a` a `b` a la altura `floor` (pilares en los extremos y dos barras). */
export function guardRail(a: P2, b: P2, floor: number): Part[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 1) return [];
  const post = (p: P2): BoxPart => box('black', [POST, RAIL, POST], [p[0], floor + RAIL / 2, p[1]]);
  const rail = (y: number) => bar('black', [a[0], y, a[1]], [b[0], y, b[1]], POST);
  return [post(a), post(b), rail(floor + RAIL - POST / 2), rail(floor + RAIL / 2)];
}

export function guardCollider(a: P2, b: P2, floor: number): CollisionBox {
  return ramp(
    [a[0], floor + RAIL, a[1]],
    [b[0], floor + RAIL, b[1]],
    GUARD_THICKNESS,
    RAIL + RAMP_THICKNESS,
  );
}

/** Recorrido de un polígono como tramos (a, b), salvo el de índice `skip`. */
function edgesExcept(polygon: readonly P2[], skip: number): [P2, P2][] {
  return polygon.flatMap((a, i) =>
    i === skip ? [] : [[a, polygon[(i + 1) % polygon.length]!] as [P2, P2]],
  );
}

/** Caja envolvente centrada a partir de las piezas (el alto incluye las barandas). */
export function partsEnvelope(parts: readonly Part[]): ItemEnvelope {
  const b = partsBounds(parts);
  return { width: b.max[0] - b.min[0], depth: b.max[2] - b.min[2], height: b.max[1] };
}

/** Polígono acercado `d` hacia adentro en cada eje (para que las barandas no salgan del borde). */
export const insetRect = (x: P2, z: P2, d: number): P2[] => [
  [x[0] + d, z[1] - d],
  [x[1] - d, z[1] - d],
  [x[1] - d, z[0] + d],
  [x[0] + d, z[0] + d],
];

// Espejo para las que giran a la izquierda (se construyen girando a la derecha).
const mirrorPart = <T extends Part>(p: T): T =>
  p.kind === 'box'
    ? { ...p, at: [-p.at[0], p.at[1], p.at[2]], rotationY: -(p.rotationY ?? 0) }
    : { ...p, at: [-p.at[0], p.at[1], p.at[2]] };
const mirrorBox = (c: CollisionBox): CollisionBox => ({
  ...c,
  at: [-c.at[0], c.at[1], c.at[2]],
  rotationY: -(c.rotationY ?? 0),
});
const mirrorPolygon = (polygon: LocalPolygon): LocalPolygon =>
  polygon.map(([x, z]) => [-x, z] as const);
const mirrorStroke = (s: PlanStroke): PlanStroke => ({
  ...s,
  points: s.points.map(([x, z]) => [-x, z] as const),
});

/** Flecha de subida: polilínea por el centro de los tramos con punta al final. */
function arrow(points: readonly P2[]): PlanStroke[] {
  const end = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  const len = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1;
  const d: P2 = [(end[0] - prev[0]) / len, (end[1] - prev[1]) / len];
  const head = 160;
  return [
    { points },
    {
      points: [
        [end[0] - d[0] * head - d[1] * head * 0.6, end[1] - d[1] * head + d[0] * head * 0.6],
        end,
        [end[0] - d[0] * head + d[1] * head * 0.6, end[1] - d[1] * head - d[0] * head * 0.6],
      ],
    },
  ];
}

/** Líneas de huella de un tramo, de borde a borde. */
function treadLines(f: Flight, s: StairSteps): PlanStroke[] {
  return Array.from({ length: f.count + 1 }, (_, j) => ({
    points: [along(f, j * s.tread, -f.width / 2), along(f, j * s.tread, f.width / 2)],
  }));
}

// --- Recta ------------------------------------------------------------------------------------

interface StairLayout {
  readonly parts: Part[];
  readonly colliders: CollisionBox[];
  readonly opening: P2[];
  readonly outline: P2[];
  readonly symbol: PlanStroke[];
}

interface RectStairParams {
  readonly width: number;
  readonly height: number;
  readonly railing: boolean;
}

function straightLayout(p: RectStairParams): StairLayout {
  const s = stairSteps(p.height);
  const depth = (s.count - 1) * s.tread;
  const flight: Flight = {
    start: [0, depth / 2],
    dir: [0, -1],
    width: p.width,
    first: 1,
    count: s.count - 1,
  };
  const x: P2 = [-p.width / 2, p.width / 2];
  const z: P2 = [-depth / 2, depth / 2];
  const outline = insetRect(x, z, 0);
  // Barandas arriba en todo el borde salvo el del fondo, por donde se llega (índice 2).
  const guards = edgesExcept(insetRect(x, z, POST / 2), 2);
  const parts = [...flightBlocks(flight, s)];
  const colliders = [flightRamp(flight, s)];
  if (p.railing) {
    parts.push(...flightRails(flight, s), ...guards.flatMap(([a, b]) => guardRail(a, b, p.height)));
    colliders.push(
      ...flightRailColliders(flight, s),
      ...guards.map(([a, b]) => guardCollider(a, b, p.height)),
    );
  }
  return {
    parts,
    colliders,
    opening: outline,
    outline,
    symbol: [
      ...treadLines(flight, s),
      ...arrow([along(flight, s.tread / 2), along(flight, depth - s.tread / 2)]),
    ],
  };
}

const stairDefinition = <P extends RectStairParams>(layout: (p: P) => StairLayout) => ({
  envelope: (p: P) => partsEnvelope(layout(p).parts),
  build: (p: P) => layout(p).parts,
  colliders: (p: P) => layout(p).colliders,
  floorOpening: (p: P) => layout(p).opening,
  planOutline: (p: P) => layout(p).outline,
  planSymbol: (p: P) => layout(p).symbol,
});

export const stairStraight = defineItem({
  id: 'stairs.straight@1',
  category: 'stairs',
  name: label('Escalera recta', 'Straight stairs'),
  keywords: ['escalera', 'escalones', 'peldaños', 'subir', 'stairs'],
  mount: 'floor',
  fillsStorey: true,
  params: { width: flightWidthParam(900), height: heightParam, railing: railingParam },
  ...stairDefinition(straightLayout),
});

// --- En L y en U --------------------------------------------------------------------------------

interface TurnStairParams extends RectStairParams {
  readonly turn: string;
}

function mirrored(layout: StairLayout, turn: string): StairLayout {
  if (turn !== 'left') return layout;
  return {
    parts: layout.parts.map(mirrorPart),
    colliders: layout.colliders.map(mirrorBox),
    opening: mirrorPolygon(layout.opening) as P2[],
    outline: mirrorPolygon(layout.outline) as P2[],
    symbol: layout.symbol.map(mirrorStroke),
  };
}

/** Descanso macizo y su colisión. */
function landing(x: P2, z: P2, top: number): { parts: Part[]; collider: CollisionBox } {
  return {
    parts: block(x, z, top),
    collider: {
      size: [x[1] - x[0], top, z[1] - z[0]],
      at: [(x[0] + x[1]) / 2, top / 2, (z[0] + z[1]) / 2],
    },
  };
}

/** En L, girando a la derecha: sube hacia el fondo, descanso en la esquina y sigue a la derecha. */
function lLayout(p: TurnStairParams): StairLayout {
  const s = stairSteps(p.height);
  const k = Math.ceil(s.count / 2);
  const f1 = k - 1;
  const f2 = s.count - 1 - k;
  const W = p.width;
  const totalW = W + f2 * s.tread;
  const totalD = W + f1 * s.tread;
  const left = -totalW / 2;
  const back = -totalD / 2;
  const first: Flight = {
    start: [left + W / 2, totalD / 2],
    dir: [0, -1],
    width: W,
    first: 1,
    count: f1,
  };
  const second: Flight = {
    start: [left + W, back + W / 2],
    dir: [1, 0],
    width: W,
    first: k + 1,
    count: f2,
  };
  const rest = landing([left, left + W], [back, back + W], k * s.riser);
  const outline: P2[] = [
    [left, totalD / 2],
    [left + W, totalD / 2],
    [left + W, back + W],
    [totalW / 2, back + W],
    [totalW / 2, back],
    [left, back],
  ];
  const i = POST / 2;
  const guardLine: P2[] = [
    [left + i, totalD / 2 - i],
    [left + W - i, totalD / 2 - i],
    [left + W - i, back + W - i],
    [totalW / 2 - i, back + W - i],
    [totalW / 2 - i, back + i],
    [left + i, back + i],
  ];
  // Se llega por el extremo derecho (índice 3).
  const guards = edgesExcept(guardLine, 3);
  const landingRails: [P2, P2][] = [
    [
      [left + i, back + W - i],
      [left + i, back + i],
    ],
    [
      [left + i, back + i],
      [left + W - i, back + i],
    ],
  ];
  const parts = [...flightBlocks(first, s), ...rest.parts, ...flightBlocks(second, s)];
  const colliders = [flightRamp(first, s), rest.collider, flightRamp(second, s)];
  if (p.railing) {
    parts.push(
      ...flightRails(first, s),
      ...flightRails(second, s),
      ...landingRails.flatMap(([a, b]) => guardRail(a, b, k * s.riser)),
      ...guards.flatMap(([a, b]) => guardRail(a, b, p.height)),
    );
    colliders.push(
      ...flightRailColliders(first, s),
      ...flightRailColliders(second, s),
      ...landingRails.map(([a, b]) => guardCollider(a, b, k * s.riser)),
      ...guards.map(([a, b]) => guardCollider(a, b, p.height)),
    );
  }
  return mirrored(
    {
      parts,
      colliders,
      opening: outline,
      outline,
      symbol: [
        ...treadLines(first, s),
        ...treadLines(second, s),
        ...arrow([
          along(first, s.tread / 2),
          [left + W / 2, back + W / 2],
          along(second, (f2 - 0.5) * s.tread),
        ]),
      ],
    },
    p.turn,
  );
}

/** Separación entre los dos tramos de la escalera en U (el ojo de la escalera). */
const U_GAP = 100;

/** En U, girando a la derecha: sube por la izquierda, descanso al fondo y vuelve por la derecha. */
function uLayout(p: TurnStairParams): StairLayout {
  const s = stairSteps(p.height, RISER_MAX, true);
  const k = s.count / 2;
  const f = k - 1;
  const W = p.width;
  const totalW = 2 * W + U_GAP;
  const totalD = W + f * s.tread;
  const left = -totalW / 2;
  const right = totalW / 2;
  const back = -totalD / 2;
  const front = totalD / 2;
  const first: Flight = {
    start: [left + W / 2, front],
    dir: [0, -1],
    width: W,
    first: 1,
    count: f,
  };
  const second: Flight = {
    start: [right - W / 2, back + W],
    dir: [0, 1],
    width: W,
    first: k + 1,
    count: f,
  };
  const rest = landing([left, right], [back, back + W], k * s.riser);
  const outline = insetRect([left, right], [back, front], 0);
  const i = POST / 2;
  // Contorno de las barandas de arriba, empezando por el tramo de llegada (que no lleva).
  const guardLine: P2[] = [
    [right - i, front - i],
    [right - W + i, front - i],
    [left + i, front - i],
    [left + i, back + i],
    [right - i, back + i],
  ];
  const guards = edgesExcept(guardLine, 0);
  const landingRails: [P2, P2][] = [
    [
      [left + i, back + W - i],
      [left + i, back + i],
    ],
    [
      [left + i, back + i],
      [right - i, back + i],
    ],
    [
      [right - i, back + i],
      [right - i, back + W - i],
    ],
  ];
  const parts = [...flightBlocks(first, s), ...rest.parts, ...flightBlocks(second, s)];
  const colliders = [flightRamp(first, s), rest.collider, flightRamp(second, s)];
  if (p.railing) {
    parts.push(
      ...flightRails(first, s),
      ...flightRails(second, s),
      ...landingRails.flatMap(([a, b]) => guardRail(a, b, k * s.riser)),
      ...guards.flatMap(([a, b]) => guardRail(a, b, p.height)),
    );
    colliders.push(
      ...flightRailColliders(first, s),
      ...flightRailColliders(second, s),
      ...landingRails.map(([a, b]) => guardCollider(a, b, k * s.riser)),
      ...guards.map(([a, b]) => guardCollider(a, b, p.height)),
    );
  }
  return mirrored(
    {
      parts,
      colliders,
      opening: outline,
      outline,
      symbol: [
        ...treadLines(first, s),
        ...treadLines(second, s),
        ...arrow([
          along(first, s.tread / 2),
          [left + W / 2, back + W / 2],
          [right - W / 2, back + W / 2],
          along(second, (f - 0.5) * s.tread),
        ]),
      ],
    },
    p.turn,
  );
}

export const stairL = defineItem({
  id: 'stairs.l@1',
  category: 'stairs',
  name: label('Escalera en L', 'L-shaped stairs'),
  keywords: ['escalera', 'descanso', 'esquina', 'stairs'],
  mount: 'floor',
  fillsStorey: true,
  params: {
    width: flightWidthParam(900),
    height: heightParam,
    turn: turnParam,
    railing: railingParam,
  },
  ...stairDefinition(lLayout),
});

export const stairU = defineItem({
  id: 'stairs.u@1',
  category: 'stairs',
  name: label('Escalera en U', 'U-shaped stairs'),
  keywords: ['escalera', 'descanso', 'ida y vuelta', 'stairs'],
  mount: 'floor',
  fillsStorey: true,
  params: {
    width: flightWidthParam(900),
    height: heightParam,
    turn: turnParam,
    railing: railingParam,
  },
  ...stairDefinition(uLayout),
});

// --- Caracol ----------------------------------------------------------------------------------

const DEG = Math.PI / 180;
/**
 * Sector de la losa que queda como descanso de llegada. Las huellas giran el resto de la vuelta,
 * así el descanso queda sobre el piso de la entrada y nunca sobre peldaños (altura libre).
 */
const SPIRAL_LANDING = 60 * DEG;
const COLUMN_RADIUS = 60;
/** Tablones de la rampa del caracol: delgados, para no restar altura libre bajo la vuelta. */
const SPIRAL_RAMP_THICKNESS = 60;
const SPIRAL_PLANKS = 3;
/** Ancho de la rampa del caracol, centrada en la línea de paso. */
const SPIRAL_WALK_BAND = 260;
/** Pilar como obstáculo (algo más grueso que el visible). */
const SPIRAL_CORE = 100;
/** Distancia de la línea de paso a la baranda: lo que ocupa una persona, con holgura. */
const SPIRAL_WALK_CLEARANCE = 360;

/**
 * Radio de la línea de paso del caracol, por donde va la rampa del recorrido: cerca de la
 * baranda, donde la huella es más ancha y la pendiente más suave.
 */
export function spiralWalkRadius(diameter: number): number {
  const railInner = diameter / 2 - POST;
  return Math.max((SPIRAL_CORE + railInner) / 2, railInner - SPIRAL_WALK_CLEARANCE);
}

interface SpiralParams {
  readonly diameter: number;
  readonly height: number;
  readonly turn: string;
  readonly railing: boolean;
}

/** Punto a radio `r` y ángulo `a` (antihorario visto desde arriba; 0 = +x, −90° = el frente). */
const polar = (r: number, a: number): P2 => [r * Math.cos(a), -r * Math.sin(a)];

function arc(r: number, from: number, to: number, maxStep = 10 * DEG): P2[] {
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / maxStep));
  return Array.from({ length: n + 1 }, (_, i) => polar(r, from + ((to - from) * i) / n));
}

/**
 * Caracol antihorario: la primera huella sale del frente y cada una gira `step`. Arriba, un sector
 * de la losa (`landingAngle`) queda como descanso de llegada; el resto del círculo es hueco.
 */
function spiralLayout(p: SpiralParams): StairLayout {
  const s = stairSteps(p.height);
  const R = p.diameter / 2;
  const walk = spiralWalkRadius(p.diameter);
  const landingAngle = SPIRAL_LANDING;
  const step = (2 * Math.PI - landingAngle) / (s.count - 1);
  const start = -90 * DEG;
  const end = start + (s.count - 1) * step;
  // Huellas como cajas radiales cuyos vértices exteriores tocan el círculo.
  const tangential = 2 * R * Math.sin(step / 2);
  const outer = R * Math.cos(step / 2);
  const parts: Part[] = [
    cylinder('dark', R, 10, [0, 5, 0]),
    cylinder('black', COLUMN_RADIUS, p.height, [0, p.height / 2, 0]),
  ];
  for (let i = 1; i < s.count; i++) {
    const a = start + (i - 0.5) * step;
    const [x, z] = polar((COLUMN_RADIUS + outer) / 2, a);
    parts.push(box('wood', [outer - COLUMN_RADIUS, 40, tangential], [x, i * s.riser - 20, z], a));
  }
  // Rampa por la línea de paso, a la altura de las narices de los peldaños: así llega al piso de
  // arriba justo en el borde del descanso (más empinada, a media huella quedaría un escalón que
  // la persona toma de costado). Tablones cortos, varios por peldaño, para que la hélice no tenga
  // quiebres que el controlador tome como escalones.
  const walkPoint = (i: number): Vec3Mm => {
    const [x, z] = polar(walk, start + (i - 1) * step);
    return [x, i * s.riser, z];
  };
  const colliders: CollisionBox[] = [
    { size: [SPIRAL_CORE * 2, p.height, SPIRAL_CORE * 2], at: [0, p.height / 2, 0] },
  ];
  for (let k = 0; k < s.count * SPIRAL_PLANKS; k++) {
    colliders.push(
      ramp(
        walkPoint(k / SPIRAL_PLANKS),
        walkPoint((k + 1) / SPIRAL_PLANKS),
        SPIRAL_WALK_BAND,
        SPIRAL_RAMP_THICKNESS,
      ),
    );
  }
  // Hueco: el círculo menos el sector de llegada (que queda como losa).
  const opening: P2[] = [[0, 0], ...arc(R, end + landingAngle, end + 2 * Math.PI)];
  const outline = arc(R, 0, 2 * Math.PI).slice(0, -1);
  if (p.railing) {
    const railPoint = (i: number, lift: number): Vec3Mm => {
      const [x, z] = polar(R - POST, start + (i - 0.5) * step);
      return [x, i * s.riser + lift, z];
    };
    for (let i = 1; i < s.count; i++) {
      const [x, , z] = railPoint(i, 0);
      parts.push(
        box('black', [BALUSTER, RAIL - POST, BALUSTER], [x, i * s.riser + (RAIL - POST) / 2, z]),
      );
      if (i + 1 < s.count) {
        parts.push(
          bar('black', railPoint(i, RAIL - POST / 2), railPoint(i + 1, RAIL - POST / 2), POST),
        );
      }
      // Como obstáculo, una caja vertical por peldaño (inclinada, sus extremos invadirían el paso),
      // hacia afuera de la baranda: no le resta ancho al paso.
      const a = start + (i - 0.5) * step;
      const [cx, cz] = polar(R - POST + GUARD_THICKNESS / 2, a);
      colliders.push({
        size: [GUARD_THICKNESS, RAIL + RAMP_THICKNESS, 2 * R * Math.sin(step / 2)],
        at: [cx, i * s.riser + (RAIL - RAMP_THICKNESS) / 2, cz],
        rotationY: a,
      });
    }
    // Barandas arriba: el arco del hueco y el borde del descanso que da al hueco.
    const guardArc = arc(R - POST, end + landingAngle, end + 2 * Math.PI);
    const radial: P2[] = [polar(COLUMN_RADIUS + POST, end + landingAngle), guardArc[0]!];
    const guards: [P2, P2][] = [
      [radial[0]!, radial[1]!],
      ...guardArc.slice(1).map((b, j): [P2, P2] => [guardArc[j]!, b]),
    ];
    parts.push(...guards.flatMap(([a, b]) => guardRail(a, b, p.height)));
    // Como obstáculo, el arco va hacia afuera de la baranda (como las de los peldaños).
    const outerArc = arc(R - POST + GUARD_THICKNESS / 2, end + landingAngle, end + 2 * Math.PI);
    colliders.push(
      guardCollider(radial[0]!, radial[1]!, p.height),
      ...outerArc.slice(1).map((b, j) => guardCollider(outerArc[j]!, b, p.height)),
    );
  }
  const symbol: PlanStroke[] = [];
  for (let i = 0; i < s.count; i++) {
    const a = start + i * step;
    symbol.push({ points: [polar(COLUMN_RADIUS, a), polar(R, a)] });
  }
  symbol.push(...arrow(arc(walk, start + step / 2, end + step / 2)));
  const layout = { parts, colliders, opening, outline, symbol };
  return mirrored(layout, p.turn === 'cw' ? 'left' : 'right');
}

export const stairSpiral = defineItem({
  id: 'stairs.spiral@1',
  category: 'stairs',
  name: label('Escalera caracol', 'Spiral stairs'),
  keywords: ['escalera', 'helicoidal', 'circular', 'stairs'],
  mount: 'floor',
  fillsStorey: true,
  params: {
    diameter: lengthParam({
      default: 1800,
      min: 1200,
      max: 3000,
      step: 10,
      label: label('Diámetro', 'Diameter'),
    }),
    height: heightParam,
    turn: choiceParam({
      default: 'ccw',
      label: label('Sentido de subida', 'Direction'),
      options: [
        { value: 'ccw', label: label('Antihorario', 'Counterclockwise') },
        { value: 'cw', label: label('Horario', 'Clockwise') },
      ],
    }),
    railing: railingParam,
  },
  envelope: (p) => partsEnvelope(spiralLayout(p).parts),
  build: (p) => spiralLayout(p).parts,
  colliders: (p) => spiralLayout(p).colliders,
  floorOpening: (p) => spiralLayout(p).opening,
  planOutline: (p) => spiralLayout(p).outline,
  planSymbol: (p) => spiralLayout(p).symbol,
});
