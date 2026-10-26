import {
  box,
  choiceParam,
  lengthParam,
  numberParam,
  type BoxPart,
  type PlanStroke,
} from '@decodeny/domain';

/**
 * Piezas y parámetros comunes de puertas y ventanas. Marco local (ver `OpeningBuildContext`):
 * `x` a lo largo del muro, `y` hacia arriba desde el piso, `z` hacia la cara izquierda. mm.
 */

export const DEG = Math.PI / 180;

/** Signo en `z` de una cara (`left` = +z). */
export const faceSign = (face: string): 1 | -1 => (face === 'left' ? 1 : -1);
/** Signo en `x` de un extremo (`end` = +x). */
export const endSign = (end: string): 1 | -1 => (end === 'end' ? 1 : -1);

// --- Parámetros reutilizables --------------------------------------------------------------

export const widthParam = (def: number, min: number, max: number) =>
  lengthParam({ default: def, min, max, step: 10, label: { es: 'Ancho', en: 'Width' } });

export const heightParam = (def: number, min: number, max: number) =>
  lengthParam({ default: def, min, max, step: 10, label: { es: 'Alto', en: 'Height' } });

export const sillParam = (def: number) =>
  lengthParam({
    default: def,
    min: 0,
    max: 5000,
    step: 10,
    label: { es: 'Antepecho (altura desde el piso)', en: 'Sill height' },
  });

export const swingParam = (label = { es: 'Abre hacia', en: 'Opens toward' }) =>
  choiceParam({
    default: 'left',
    semantic: 'wall-face',
    label,
    options: [
      { value: 'left', label: { es: 'Cara A', en: 'Side A' } },
      { value: 'right', label: { es: 'Cara B', en: 'Side B' } },
    ],
  });

export const hingeParam = (label = { es: 'Bisagras', en: 'Hinges' }) =>
  choiceParam({
    default: 'start',
    semantic: 'wall-end',
    label,
    options: [
      { value: 'start', label: { es: 'Extremo A', en: 'End A' } },
      { value: 'end', label: { es: 'Extremo B', en: 'End B' } },
    ],
  });

export const openAngleParam = (def: number, max = 110) =>
  numberParam({
    default: def,
    min: 0,
    max,
    step: 5,
    unit: 'deg',
    label: { es: 'Apertura', en: 'Opening angle' },
  });

export const openPercentParam = (def: number) =>
  numberParam({
    default: def,
    min: 0,
    max: 100,
    step: 5,
    unit: 'percent',
    label: { es: 'Abierta', en: 'Open' },
  });

// --- Piezas ------------------------------------------------------------------------------------

/** Marco perimetral que ocupa el espesor del muro: jambas, dintel y (en ventanas) peana. */
export function frame(
  width: number,
  height: number,
  sill: number,
  depth: number,
  options: { readonly bottom: boolean; readonly bar?: number; readonly slot?: string },
): BoxPart[] {
  const bar = options.bar ?? 50;
  const slot = options.slot ?? 'frame';
  const parts: BoxPart[] = [
    box(slot, [bar, height, depth], [-(width - bar) / 2, sill + height / 2, 0]),
    box(slot, [bar, height, depth], [(width - bar) / 2, sill + height / 2, 0]),
    box(slot, [width - 2 * bar, bar, depth], [0, sill + height - bar / 2, 0]),
  ];
  if (options.bottom) {
    parts.push(box(slot, [width - 2 * bar, bar, depth], [0, sill + bar / 2, 0]));
  }
  return parts;
}

/** Hoja vidriada (bastidor + vidrio) centrada en `(x, z)`, en el marco de la hoja. */
export function glazedSash(
  width: number,
  height: number,
  y0: number,
  x: number,
  z: number,
  options: { readonly bar?: number; readonly depth?: number } = {},
): BoxPart[] {
  const bar = options.bar ?? 40;
  const depth = options.depth ?? 50;
  return [
    ...frame(width, height, y0, depth, { bottom: true, bar, slot: 'sash' }).map((p) =>
      offsetPart(p, x, z),
    ),
    box('glass', [width - 2 * bar, height - 2 * bar, 6], [x, y0 + height / 2, z]),
  ];
}

const offsetPart = (p: BoxPart, dx: number, dz: number): BoxPart => ({
  ...p,
  at: [p.at[0] + dx, p.at[1], p.at[2] + dz],
});

/** Gira `[x, z]` un ángulo antihorario (visto desde arriba) alrededor de `pivot`. */
export function rotateAround(
  p: readonly [number, number],
  pivot: readonly [number, number],
  angle: number,
): [number, number] {
  const dx = p[0] - pivot[0];
  const dz = p[1] - pivot[1];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [pivot[0] + dx * c - dz * s, pivot[1] + dx * s + dz * c];
}

/** Aplica un giro alrededor de un pivote vertical a piezas definidas en posición cerrada. */
export function swingParts(
  parts: readonly BoxPart[],
  pivot: readonly [number, number],
  angle: number,
): BoxPart[] {
  if (angle === 0) return [...parts];
  return parts.map((p) => {
    const [x, z] = rotateAround([p.at[0], p.at[2]], pivot, angle);
    return { ...p, at: [x, p.at[1], z], rotationY: (p.rotationY ?? 0) + angle };
  });
}

/**
 * Ángulo de giro de una hoja con bisagra en el extremo `hinge` (±x) que abre hacia la cara
 * `face` (±z): el borde libre va de (−hinge, 0) hacia (0, face).
 */
export const leafAngle = (hinge: 1 | -1, face: 1 | -1, openRad: number): number =>
  -hinge * face * openRad;

/** Arco de apertura + hoja abierta a 90° (símbolo de planta de una puerta batiente). */
export function swingSymbol(
  pivot: readonly [number, number],
  length: number,
  hinge: 1 | -1,
  face: 1 | -1,
  segments = 16,
): PlanStroke[] {
  const closedEnd: [number, number] = [pivot[0] - hinge * length, pivot[1]];
  const arc: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    arc.push(
      rotateAround(closedEnd, pivot, leafAngle(hinge, face, (Math.PI / 2) * (i / segments))),
    );
  }
  return [{ points: arc, dashed: true }, { points: [[pivot[0], pivot[1]], arc[arc.length - 1]!] }];
}

/** Altura de la manilla: 1 m, o media altura en puertas bajas. */
export const handleHeight = (doorHeight: number): number => Math.min(1000, doorHeight / 2);

/** Manillas a ambos lados de una hoja (en posición cerrada). */
export function handles(x: number, z: number, leafThickness: number, y = 1000): BoxPart[] {
  const offset = leafThickness / 2 + 12;
  return [
    box('handle', [110, 18, 18], [x, y, z + offset]),
    box('handle', [110, 18, 18], [x, y, z - offset]),
  ];
}
