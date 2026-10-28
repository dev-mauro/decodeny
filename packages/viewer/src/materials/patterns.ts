import type { ResolvedMaterial } from '@decodeny/domain';

/**
 * Patrones procedurales de materiales: generan una imagen RGBA que **se repite** y cubre un
 * tamaño físico conocido (`sizeMm`), de modo que una baldosa de 60 cm mide 60 cm en cualquier
 * superficie. Son píxeles calculados en JS puro (sin canvas): deterministas y testeables en Node.
 * Agregar un patrón = registrar un pintor aquí; los materiales del catálogo lo referencian.
 */
export interface PatternImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  /** Tamaño físico (mm) que cubre la imagen: ancho (u) × alto (v). */
  readonly sizeMm: readonly [number, number];
}

/**
 * Campo de un patrón, independiente de los colores: por píxel, un factor de sombra sobre el
 * color base o (capa secundaria) sobre el color secundario (fragüe, franja, cantería).
 * Calcularlo es lo caro; colorearlo es barato, así cambiar un color es instantáneo.
 */
export interface PatternField {
  readonly width: number;
  readonly height: number;
  readonly sizeMm: readonly [number, number];
  /** Sombra por píxel; los valores ≥ `SECONDARY` pertenecen a la capa secundaria. */
  readonly shade: Float32Array;
  /** Parámetro de color de la capa secundaria (p. ej. `grout`). */
  readonly secondary?: { readonly param: string; readonly fallback: string };
}

export type PatternPainter = (material: ResolvedMaterial) => PatternField;

/** Desplazamiento que marca un píxel como de la capa secundaria. */
const SECONDARY = 10;
/** Sombra de un píxel de la capa secundaria. */
const second = (f = 1) => SECONDARY + f;

type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hash entero → [0, 1). */
function hash(...values: readonly number[]): number {
  let h = 2166136261;
  for (const v of values) {
    h ^= Math.floor(v) + 0x9e3779b9;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/** Ruido de valor 2D periódico (`px` × `py` celdas) con interpolación suave. */
function noise(x: number, y: number, px: number, py: number, seed = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) => hash(((i % px) + px) % px, ((j % py) + py) % py, seed);
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Ruido fractal periódico en [0, 1] sobre coordenadas normalizadas `u`, `v` ∈ [0, 1). */
function fbm(u: number, v: number, base: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const f = base * 2 ** o;
    sum += amp * noise(u * f, v * f, f, f, seed + o);
    norm += amp;
    amp /= 2;
  }
  return sum / norm;
}

/** Píxeles por mm para que el periodo quepa en ~`target` px (con un máximo de 1024). */
function resolution(periodMm: number, target = 512): number {
  return Math.min(1024 / periodMm, Math.max(target / periodMm, 0.2));
}

/** Lado máximo (px) de la imagen que se está pintando; ver `patternField`. */
let maxSide = 1024;

function paint(
  sizeMm: readonly [number, number],
  requestedPxPerMm: number,
  shadeAt: (xMm: number, yMm: number, u: number, v: number) => number,
  secondary?: PatternField['secondary'],
): PatternField {
  const pxPerMm = Math.min(requestedPxPerMm, maxSide / Math.max(sizeMm[0], sizeMm[1]));
  const width = Math.max(8, Math.round(sizeMm[0] * pxPerMm));
  const height = Math.max(8, Math.round(sizeMm[1] * pxPerMm));
  const shade = new Float32Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const u = (i + 0.5) / width;
      const v = (j + 0.5) / height;
      shade[j * width + i] = shadeAt(u * sizeMm[0], v * sizeMm[1], u, v);
    }
  }
  return secondary ? { width, height, sizeMm, shade, secondary } : { width, height, sizeMm, shade };
}

const num = (m: ResolvedMaterial, key: string, fallback: number): number => {
  const v = m.params[key];
  return typeof v === 'number' && v > 0 ? v : fallback;
};

// --- Pintores ---------------------------------------------------------------------------------

const plain: PatternPainter = () =>
  // Una variación mínima evita el aspecto de "plástico" y el banding.
  paint([500, 500], 0.25, (_x, _y, u, v) => 0.985 + 0.03 * fbm(u, v, 4, 3));

const linen: PatternPainter = () =>
  paint([200, 200], 1.5, (x, y, u, v) => {
    const weave = 0.5 + 0.25 * Math.sin(x * 2.2) + 0.25 * Math.sin(y * 2.2);
    return 0.93 + 0.06 * weave + 0.04 * fbm(u, v, 16, 2);
  });

const concrete: PatternPainter = () =>
  paint([1200, 1200], 0.4, (_x, _y, u, v) => {
    const cloud = fbm(u, v, 4, 5);
    const pore = noise(u * 160, v * 160, 160, 160, 7) > 0.97 ? 0.85 : 1;
    return (0.86 + 0.24 * cloud) * pore;
  });

const carpet: PatternPainter = () =>
  paint(
    [300, 300],
    1.6,
    (_x, _y, u, v) => 0.86 + 0.18 * noise(u * 256, v * 256, 256, 256, 3) + 0.08 * fbm(u, v, 6, 3),
  );

const stripes: PatternPainter = (m) => {
  const width = num(m, 'stripe', 120);
  return paint(
    [width * 2, 200],
    resolution(width * 2, 256),
    (x, _y, u, v) => {
      const f = 0.97 + 0.03 * fbm(u, v, 8, 2);
      return x < width ? f : second(f);
    },
    { param: 'accent', fallback: '#d9cfc0' },
  );
};

const motif: PatternPainter = (m) => {
  const size = num(m, 'repeat', 250);
  return paint(
    [size, size],
    resolution(size, 384),
    (x, y) => {
      const u = x / size - 0.5;
      const v = y / size - 0.5;
      // Rombo con un punto al centro y en las esquinas (motivo tipo damasco simplificado).
      const diamond = Math.abs(Math.abs(u) + Math.abs(v) - 0.42) < 0.018;
      const dot =
        Math.hypot(u, v) < 0.07 || Math.hypot(Math.abs(u) - 0.5, Math.abs(v) - 0.5) < 0.05;
      return diamond || dot ? second() : 1;
    },
    { param: 'accent', fallback: '#b7a68c' },
  );
};

/** Baldosas o ladrillos en grilla, alineados o trabados (fila sí, fila no media pieza). */
function grid(
  w: number,
  h: number,
  joint: number,
  brick: boolean,
  variation: number,
  secondary: NonNullable<PatternField['secondary']>,
): PatternField {
  const cellW = w + joint;
  const cellH = h + joint;
  const size: [number, number] = [cellW * (brick ? 1 : 2), cellH * 2];
  return paint(
    size,
    resolution(Math.max(size[0], size[1])),
    (x, y, u, v) => {
      const row = Math.floor(y / cellH);
      const offset = brick && row % 2 === 1 ? cellW / 2 : 0;
      const xx = (x + offset) % cellW;
      const column = Math.floor((x + offset) / cellW);
      const yy = y % cellH;
      if (xx < joint / 2 || xx > cellW - joint / 2 || yy < joint / 2 || yy > cellH - joint / 2) {
        return second();
      }
      const tone = 1 + (hash(row, column, 11) - 0.5) * variation;
      return tone * (0.97 + 0.04 * fbm(u, v, 12, 2));
    },
    secondary,
  );
}

const tiles: PatternPainter = (m) =>
  grid(
    num(m, 'tileWidth', 600),
    num(m, 'tileHeight', num(m, 'tileWidth', 600)),
    num(m, 'joint', 2),
    m.params.layout === 'brick',
    0.05,
    { param: 'grout', fallback: '#c8c8c8' },
  );

const brick: PatternPainter = (m) =>
  grid(num(m, 'length', 290), num(m, 'height', 70), num(m, 'joint', 12), true, 0.25, {
    param: 'mortar',
    fallback: '#cfc6b8',
  });

/** Veta de madera a lo largo del eje local `along` dentro de una tabla. */
function wood(along: number, across: number, plankId: number): number {
  const tone = 0.93 + 0.11 * hash(plankId, 5);
  const grain =
    0.5 + 0.5 * Math.sin(across * 0.9 + 3 * noise(along * 0.004, across * 0.05, 1e6, 1e6, plankId));
  return tone * (0.92 + 0.1 * grain);
}

/** Sombra de las juntas entre tablas. */
export const SEAM = 0.62;

const planks: PatternPainter = (m) => {
  const w = num(m, 'plankWidth', 190);
  const l = num(m, 'plankLength', 1290);
  const rows = 8;
  // Desfase pseudoaleatorio fijo por fila: el patrón se repite cada `rows` filas.
  const offsets = Array.from({ length: rows }, (_, r) => hash(r, 17) * l);
  return paint([l, w * rows], resolution(Math.max(l, w * rows)), (x, y) => {
    const row = Math.floor(y / w);
    const xx = (x + offsets[row % rows]!) % l;
    const yy = y - row * w;
    if (xx < 1 || yy < 0.8) return SEAM;
    return wood(xx, yy, row * 31 + Math.floor((x + offsets[row % rows]!) / l));
  });
};

/** Espiga a 90°: escaleras de tablas horizontales y verticales (largo = n × ancho). */
const herringbone: PatternPainter = (m) => {
  const w = num(m, 'plankWidth', 70);
  const n = Math.max(2, Math.round(num(m, 'plankLength', 350) / w));
  const period = 2 * n * w;
  return paint([period, period], resolution(period), (xMm, yMm) => {
    const px = xMm / w;
    const py = yMm / w;
    const m0 = Math.round((px - py) / (2 * n));
    for (let k = m0 - 2; k <= m0 + 2; k++) {
      // Cada escalera se traslada (n, −n) respecto de la anterior.
      const qx = px - k * n;
      const qy = py + k * n;
      const s = Math.floor(qy);
      if (qx >= s && qx < s + n) {
        const along = (qx - s) * w;
        const across = (qy - s) * w;
        return along < 0.8 || across < 0.8 ? SEAM : wood(along, across, k * 1000 + s * 2);
      }
      const t = Math.floor(qx);
      if (qy >= t + 1 && qy < t + 1 + n) {
        const along = (qy - t - 1) * w;
        const across = (qx - t) * w;
        return along < 0.8 || across < 0.8 ? SEAM : wood(along, across, k * 1000 + t * 2 + 1);
      }
    }
    return SEAM;
  });
};

export const patternPainters = new Map<string, PatternPainter>([
  ['plain', plain],
  ['linen', linen],
  ['concrete', concrete],
  ['carpet', carpet],
  ['stripes', stripes],
  ['motif', motif],
  ['tiles', tiles],
  ['brick', brick],
  ['planks', planks],
  ['herringbone', herringbone],
]);

const fieldCache = new Map<string, PatternField>();
const FIELD_CACHE_LIMIT = 48;

/**
 * Campo del patrón (cacheado): depende del patrón, de sus parámetros que no son colores y de
 * la resolución máxima (`maxPx`; las muestras de la UI usan una baja).
 */
export function patternField(material: ResolvedMaterial, maxPx = 1024): PatternField {
  const shapeParams = Object.entries(material.params).filter(
    ([key]) => material.definition.params[key]?.kind !== 'color',
  );
  const key = `${material.definition.pattern}|${maxPx}|${JSON.stringify(shapeParams)}`;
  let field = fieldCache.get(key);
  if (!field) {
    maxSide = maxPx;
    try {
      field = (patternPainters.get(material.definition.pattern) ?? plain)(material);
    } finally {
      maxSide = 1024;
    }
    const oldest = fieldCache.keys().next();
    if (fieldCache.size >= FIELD_CACHE_LIMIT && !oldest.done) fieldCache.delete(oldest.value);
    fieldCache.set(key, field);
  }
  return field;
}

/** Aplica los colores de la instancia a un campo: barato (una multiplicación por píxel). */
export function colorizeField(field: PatternField, material: ResolvedMaterial): PatternImage {
  const base = hexToRgb(material.color);
  const value = field.secondary ? material.params[field.secondary.param] : undefined;
  const secondary = field.secondary
    ? hexToRgb(typeof value === 'string' ? value : field.secondary.fallback)
    : base;
  const data = new Uint8ClampedArray(field.shade.length * 4);
  for (let i = 0; i < field.shade.length; i++) {
    let f = field.shade[i]!;
    let c = base;
    if (f >= SECONDARY) {
      f -= SECONDARY;
      c = secondary;
    }
    data[i * 4] = c[0] * f;
    data[i * 4 + 1] = c[1] * f;
    data[i * 4 + 2] = c[2] * f;
    data[i * 4 + 3] = 255;
  }
  return { width: field.width, height: field.height, sizeMm: field.sizeMm, data };
}

/** Imagen del patrón de un material (con `plain` si el patrón es desconocido). */
export function paintMaterial(material: ResolvedMaterial, maxPx = 1024): PatternImage {
  return colorizeField(patternField(material, maxPx), material);
}

/** Cuánto se acerca cada nivel reducido a su píxel más oscuro (0: promedio, 1: mínimo). */
const LINE_KEEP = 0.5;

/**
 * Niveles reducidos (mipmaps) de un patrón, hasta 1 × 1, que conservan las líneas finas: cada
 * bloque de 2 × 2 promedia y luego se acerca a su píxel más oscuro. Con el promedio simple, una
 * junta de 1–2 px se diluye en los primeros niveles y el piso se ve liso de lejos o en ángulo
 * rasante; así las juntas se van aclarando de a poco con la distancia.
 */
export function lineKeepingMipmaps(image: PatternImage): PatternImage[] {
  const levels: PatternImage[] = [image];
  let prev = image;
  while (prev.width > 1 || prev.height > 1) {
    const width = Math.max(1, Math.floor(prev.width / 2));
    const height = Math.max(1, Math.floor(prev.height / 2));
    const data = new Uint8ClampedArray(width * height * 4);
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const xs = [Math.min(prev.width - 1, i * 2), Math.min(prev.width - 1, i * 2 + 1)];
        const ys = [Math.min(prev.height - 1, j * 2), Math.min(prev.height - 1, j * 2 + 1)];
        let darkest = -1;
        let darkestLum = Infinity;
        const sum = [0, 0, 0];
        for (const y of ys) {
          for (const x of xs) {
            const k = (y * prev.width + x) * 4;
            const lum = prev.data[k]! + prev.data[k + 1]! + prev.data[k + 2]!;
            for (let c = 0; c < 3; c++) sum[c]! += prev.data[k + c]!;
            if (lum < darkestLum) {
              darkestLum = lum;
              darkest = k;
            }
          }
        }
        const o = (j * width + i) * 4;
        for (let c = 0; c < 3; c++) {
          const avg = sum[c]! / 4;
          data[o + c] = avg - LINE_KEEP * (avg - prev.data[darkest + c]!);
        }
        data[o + 3] = 255;
      }
    }
    prev = { width, height, data, sizeMm: image.sizeMm };
    levels.push(prev);
  }
  return levels;
}
