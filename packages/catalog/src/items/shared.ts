import {
  box,
  choiceParam,
  lengthParam,
  numberParam,
  type BoxPart,
  type LocalizedText,
} from '@decodeny/domain';

/**
 * Utilidades de muebles. Marco local (ver `ItemDefinition`): `x` a lo ancho, `y` hacia arriba,
 * `z` a lo profundo con el frente en +z; origen en el centro de la huella, sobre el piso. mm.
 * Regla: las piezas llenan exactamente la caja ancho × alto × profundidad (test de contrato).
 */

const label = (es: string, en: string): LocalizedText => ({ es, en });

/**
 * Rangos amplios a propósito: el usuario conoce sus muebles y manda (un velador de 25 cm, un
 * sofá de 4,5 m). Los generadores deben verse razonables en todo el rango (test de contrato).
 */
export const SIZE_LIMITS = { min: 100, maxPlan: 6000, maxHeight: 3000 } as const;

export const widthParam = (def: number) =>
  lengthParam({
    default: def,
    min: SIZE_LIMITS.min,
    max: SIZE_LIMITS.maxPlan,
    step: 10,
    label: label('Ancho', 'Width'),
  });
export const depthParam = (def: number, text = label('Profundidad', 'Depth')) =>
  lengthParam({
    default: def,
    min: SIZE_LIMITS.min,
    max: SIZE_LIMITS.maxPlan,
    step: 10,
    label: text,
  });
export const heightParam = (def: number) =>
  lengthParam({
    default: def,
    min: SIZE_LIMITS.min,
    max: SIZE_LIMITS.maxHeight,
    step: 10,
    label: label('Alto', 'Height'),
  });

export const countParam = (def: number, max: number, text: LocalizedText) =>
  numberParam({ default: def, min: 1, max, step: 1, unit: 'count', label: text });

/** Acota `value` a [min, max] (para piezas internas cuando el mueble es muy chico). */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Lado (visto de frente) en que va un elemento asimétrico: cajonera, chaise longue… */
export const handParam = (text: LocalizedText) =>
  choiceParam({
    default: 'right',
    label: text,
    options: [
      { value: 'left', label: label('Izquierda', 'Left') },
      { value: 'right', label: label('Derecha', 'Right') },
    ],
  });

export const handSign = (hand: string): 1 | -1 => (hand === 'left' ? -1 : 1);

/** Caja definida por sus límites (más legible que centro + tamaño). */
export function span(
  slot: string,
  x: readonly [number, number],
  y: readonly [number, number],
  z: readonly [number, number],
): BoxPart {
  return box(
    slot,
    [x[1] - x[0], y[1] - y[0], z[1] - z[0]],
    [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2],
  );
}

/** Cuatro patas cuadradas de lado `size`, a `inset` del borde. Su grosor no depende del ancho. */
export function legs(
  width: number,
  depth: number,
  top: number,
  size: number,
  inset = 0,
  slot = 'wood',
): BoxPart[] {
  const x = width / 2 - inset - size / 2;
  const z = depth / 2 - inset - size / 2;
  return [
    [-x, -z],
    [x, -z],
    [-x, z],
    [x, z],
  ].map(([px, pz]) => box(slot, [size, top, size], [px!, top / 2, pz!]));
}

/** Frentes de cajones apilados (con su tirador al ras) en la cara frontal. */
export function drawerFronts(
  x: readonly [number, number],
  y: readonly [number, number],
  count: number,
  depth: number,
  gap = 4,
): BoxPart[] {
  const front = depth / 2;
  const height = (y[1] - y[0] - gap * (count + 1)) / count;
  const parts: BoxPart[] = [];
  for (let i = 0; i < count; i++) {
    const y0 = y[0] + gap + i * (height + gap);
    parts.push(
      span('lacquer', [x[0] + gap, x[1] - gap], [y0, y0 + height], [front - 20, front - 6]),
    );
    const cx = (x[0] + x[1]) / 2;
    const handle = Math.min(160, (x[1] - x[0]) * 0.4);
    parts.push(
      span(
        'metal',
        [cx - handle / 2, cx + handle / 2],
        [y0 + height / 2 - 8, y0 + height / 2 + 8],
        [front - 6, front],
      ),
    );
  }
  return parts;
}
