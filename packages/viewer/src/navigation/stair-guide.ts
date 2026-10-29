import { itemBase, resolveItemDefinition } from '@decodeny/catalog';
import { itemLocalToPlan, resolveParams, type Level } from '@decodeny/domain';
import { planToWorld, type Vec3Tuple } from '../coords';
import type { StairFooting } from './person-step';

/**
 * Asistencia de las escaleras en el recorrido (I12): la persona va siempre hacia donde la llevan
 * las teclas y la mirada. Sobre un tramo (y al llegar o salir de él), la altura de los pies sale
 * del perfil de su línea de paso (`walkPath`): se sube y se baja parejo, sin los quiebres ni las
 * uniones de las rampas de colisión. Si se avanza casi a lo largo del tramo (y al acercarse a él),
 * el paso se endereza suavemente con él, se aleja de las barandas y, en un tramo curvo (caracol),
 * la mirada acompaña de a poco su giro. De costado o mirando a otro lado, solo cuenta la altura.
 */
export interface StairGuide {
  readonly id: string;
  /** Línea de paso en el mundo (m), de abajo hacia arriba. */
  readonly points: readonly Vec3Tuple[];
  /** Medio ancho (m) por el que se camina a cada lado de la línea (`walkWidth`). */
  readonly halfWidth: number;
}

/** Ancho de paso (mm) de una escalera que no lo declara. */
const DEFAULT_WALK_WIDTH = 900;

/** Las guías de todas las escaleras de las plantas. */
export function stairGuides(levels: readonly Level[]): StairGuide[] {
  return levels.flatMap((level) =>
    level.items.flatMap((item): StairGuide[] => {
      const definition = resolveItemDefinition(item.def);
      const params = resolveParams(definition.params, item.params);
      const path = definition.walkPath?.(params);
      if (!path || path.length < 2) return [];
      const base = level.elevation + itemBase(level, item);
      return [
        {
          id: item.id,
          points: path.map(([x, y, z]) => planToWorld(itemLocalToPlan(item, x, z), base + y)),
          halfWidth: (definition.walkWidth?.(params) ?? DEFAULT_WALK_WIDTH) / 2000,
        },
      ];
    }),
  );
}

export interface GuideHit {
  readonly guide: StairGuide;
  /** Punto de la línea más cercano (m). */
  readonly point: Vec3Tuple;
  /** Dirección horizontal de subida en ese punto (unitaria, x–z), continua a lo largo del tramo. */
  readonly up: readonly [number, number];
  /** Antes del pie del tramo (−1), sobre él (0) o pasada su llegada (1). */
  readonly outside: -1 | 0 | 1;
  /** Tramo de la línea y cuánto (m, en planta) se avanzó por él desde su inicio (puede salirse). */
  readonly segment: number;
  readonly along: number;
}

/** A qué distancia (m) de la línea, en altura, se está "sobre la escalera". */
const ON_GUIDE_V = 0.45;
/** Cuánto antes del pie o después de la llegada (m) ya se endereza el paso para entrar. */
const APPROACH = 0.6;
/** Pendiente mínima (alto/largo) de un tramo de la línea: los descansos no asisten. */
const MIN_SLOPE = 0.15;

type Dir = readonly [number, number];

const unit = (x: number, z: number): [number, number] => {
  const length = Math.hypot(x, z);
  return length < 1e-9 ? [0, 0] : [x / length, z / length];
};

/** Dirección horizontal del tramo `i` de la línea si es inclinado (un descanso no cuenta). */
function slopedDir(pts: readonly Vec3Tuple[], i: number): Dir | null {
  const a = pts[i];
  const b = pts[i + 1];
  if (!a || !b) return null;
  const run = Math.hypot(b[0] - a[0], b[2] - a[2]);
  if (run < 1e-6 || Math.abs(b[1] - a[1]) < MIN_SLOPE * run) return null;
  return [(b[0] - a[0]) / run, (b[2] - a[2]) / run];
}

/**
 * La escalera bajo los pies (mundo, m), si se está sobre un tramo inclinado de su línea de paso
 * o a punto de entrar a él: dentro de su ancho de paso y cerca en altura. La dirección se
 * interpola entre tramos vecinos, así en un caracol gira de forma continua (sin saltos de un
 * tablón al siguiente).
 */
export function guideAt(guides: readonly StairGuide[], feet: Vec3Tuple): GuideHit | null {
  let best: (GuideHit & { readonly distance: number }) | null = null;
  for (const guide of guides) {
    const pts = guide.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const dir = slopedDir(pts, i);
      if (!dir) continue;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const len = Math.hypot(dx, dz);
      const prev = slopedDir(pts, i - 1);
      const next = slopedDir(pts, i + 1);
      const raw = ((feet[0] - a[0]) * dx + (feet[2] - a[2]) * dz) / (len * len);
      // Fuera del tramo solo cuenta el acercamiento por un extremo libre (pie o llegada); entre
      // tramos vecinos se toleran ambos lados (por fuera de una curva, ninguno cubriría la unión).
      const margin = APPROACH / len;
      if (raw < (prev ? -0.5 : -margin) || raw > (next ? 1.5 : 1 + margin)) continue;
      const t = Math.max(0, Math.min(1, raw));
      const point: Vec3Tuple = [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t];
      const distance = Math.hypot(feet[0] - point[0], feet[2] - point[2]);
      if (distance > guide.halfWidth || Math.abs(feet[1] - point[1]) > ON_GUIDE_V) continue;
      if (best && best.distance <= distance) continue;
      // En cada extremo, la dirección es la media con el tramo vecino.
      const from = prev ? unit(prev[0] + dir[0], prev[1] + dir[1]) : dir;
      const to = next ? unit(next[0] + dir[0], next[1] + dir[1]) : dir;
      const up = unit(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t);
      const outside = raw < 0 && !prev ? -1 : raw > 1 && !next ? 1 : 0;
      best = { guide, point, up, outside, segment: i, along: raw * len, distance };
    }
  }
  return best;
}

const runOf = (pts: readonly Vec3Tuple[], i: number): number =>
  Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![2] - pts[i]![2]);

/**
 * Las aristas (como la de llegada) se toman algo más cerca de lo que marca la línea de paso: en una
 * curva lo están (la recta es más corta que el arco). Bajo los pies no cambia nada.
 */
const EDGE_REACH = 1.06;
/**
 * Medio largo (m) del tramo en el que se promedia el apoyo, y sus muestras: el pie de un tramo
 * (llano a pendiente) es un quiebre seco del apoyo; promediado, se empieza a subir de a poco.
 */
const SMOOTH = 0.1;
const SMOOTH_SAMPLES = 2;
/** Paso (m) con el que se mide la pendiente del apoyo. */
const SLOPE_STEP = 0.05;

/**
 * Altura (m) a la que quedan los pies de una persona de radio `radius` apoyada sobre el perfil de
 * la línea de paso (pasados sus extremos, llano: el piso de abajo o el de llegada), como una esfera:
 * en la pendiente queda algo por encima de la línea (se apoya por delante) y en los quiebres se
 * apoya en el borde. Es lo que haría la física sobre la rampa, pero sin sus uniones. El perfil es
 * una poligonal: la esfera la toca en un vértice o tangente a un tramo, y se calcula exacto.
 */
function restAt(hit: GuideHit, radius: number, shift: number): number {
  const pts = hit.guide.points;
  // Dónde queda cada punto de la línea respecto de la persona (m, siguiendo la línea).
  const offsets: number[] = [];
  offsets[hit.segment] = -(hit.along + shift);
  for (let k = hit.segment + 1; k < pts.length; k++)
    offsets[k] = offsets[k - 1]! + runOf(pts, k - 1);
  for (let k = hit.segment - 1; k >= 0; k--) offsets[k] = offsets[k + 1]! - runOf(pts, k);
  const reach = radius * EDGE_REACH;
  let rest = -Infinity;
  const touch = (u: number, h: number) => {
    const d = u / EDGE_REACH;
    rest = Math.max(rest, h + Math.sqrt(Math.max(0, radius * radius - d * d)) - radius);
  };
  /** Un tramo recto del perfil, de `ua` a `ub` (alturas `ha` y `hb`). */
  const piece = (ua: number, ha: number, ub: number, hb: number) => {
    const from = Math.max(ua, -reach);
    const to = Math.min(ub, reach);
    if (from > to) return;
    const grade = Number.isFinite(ub - ua) && ub - ua > 1e-9 ? (hb - ha) / (ub - ua) : 0;
    const h = (u: number) => (grade === 0 ? ha : ha + grade * (u - ua));
    touch(from, h(from));
    touch(to, h(to));
    // Tangente al tramo: donde la pendiente de la esfera iguala la del tramo.
    const g = grade * EDGE_REACH;
    const tangent = ((radius * g) / Math.hypot(1, g)) * EDGE_REACH;
    if (tangent > from && tangent < to) touch(tangent, h(tangent));
  };
  const last = pts.length - 1;
  piece(-Infinity, pts[0]![1], offsets[0]!, pts[0]![1]);
  for (let k = 0; k < last; k++) piece(offsets[k]!, pts[k]![1], offsets[k + 1]!, pts[k + 1]![1]);
  piece(offsets[last]!, pts[last]![1], Infinity, pts[last]![1]);
  return rest;
}

/**
 * El apoyo (`restAt`) promediado alrededor del lugar: sin quiebres secos al pie. Nunca por debajo
 * del apoyo justo (en un borde, como la llegada, no se roza).
 */
function restHeight(hit: GuideHit, radius: number, shift = 0): number {
  let sum = 0;
  for (let k = -SMOOTH_SAMPLES; k <= SMOOTH_SAMPLES; k++) {
    sum += restAt(hit, radius, shift + (k / SMOOTH_SAMPLES) * SMOOTH);
  }
  return Math.max(sum / (2 * SMOOTH_SAMPLES + 1), restAt(hit, radius, shift));
}

/** Rumbo (yaw) cuya dirección "adelante" es `dir` (x–z). */
export const headingOf = (dir: Dir): number => Math.atan2(-dir[0], -dir[1]);

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Desvío respecto del tramo hasta el que el paso se endereza del todo, y hasta el que asiste. */
const ALIGN_FULL = (15 * Math.PI) / 180;
const ALIGN_CONE = (45 * Math.PI) / 180;
/** Hasta qué desvío la mirada acompaña del todo el giro del tramo, y hasta cuál algo. */
const TURN_FULL = (35 * Math.PI) / 180;
const TURN_CONE = (70 * Math.PI) / 180;
/**
 * Lejos de las barandas: se camina libre por el medio del tramo, pero a menos de `EDGE` (m) del
 * borde del ancho de paso (la persona y la baranda) el paso vuelve de a poco hacia la línea:
 * cuánto se corrige por metro de más y hasta cuánto. En una caracol, angosta, esto la mantiene
 * en la línea de paso (no se va hacia afuera en la curva).
 */
const EDGE = 0.4;
const CENTER_GAIN = 4;
const CENTER_MAX = 0.4;

/** 0 desde `cone` de desvío, 1 hasta `full`, con un paso suave entre ambos. */
function within(off: number, full: number, cone: number): number {
  const s = Math.min(1, Math.max(0, (cone - off) / (cone - full)));
  return s * s * (3 - 2 * s);
}

export interface StairAssist {
  /**
   * Dirección horizontal del movimiento (x–z). Del largo pedido en llano; en la pendiente, algo
   * menor, para que la velocidad a lo largo de la escalera sea la de caminar.
   */
  readonly direction: [number, number];
  /** Cuánto gira la mirada en este paso (radianes): lo que giró el tramo, según la asistencia. */
  readonly yawDelta: number;
  /** Dónde se apoya la persona sobre la escalera. */
  readonly footing: StairFooting;
}

/** Lo que la asistencia recuerda entre pasos. */
export interface GuideState {
  /** Rumbo de subida del tramo en el paso anterior (si se iba por una escalera). */
  heading: number | null;
}

export const newGuideState = (): GuideState => ({ heading: null });

/**
 * Asiste un paso hacia `direction` (x–z, la que piden las teclas y la mirada) de una persona de
 * radio `radius` (m, con el margen del controlador): da la altura de sus pies; cuanto más a lo largo
 * de la escalera se va (subiendo o bajando, según hacia dónde se camine), más se endereza con el
 * tramo y se aleja de las barandas; desde 45° de desvío la dirección no cambia. Si se camina a lo largo, la mirada gira lo
 * que giró el tramo (en una caracol, de a poco y sin saltos). Devuelve `null` si no hay escalera.
 */
export function assistStep(
  guides: readonly StairGuide[],
  feet: Vec3Tuple,
  direction: readonly [number, number],
  radius: number,
  state: GuideState,
): StairAssist | null {
  const hit = guideAt(guides, feet);
  if (!hit) {
    state.heading = null;
    return null;
  }
  const speed = Math.hypot(direction[0], direction[1]);
  // Parado sobre el tramo, solo la altura.
  if (speed < 1e-6) {
    state.heading = hit.outside === 0 ? headingOf(hit.up) : null;
    return { direction: [0, 0], yawDelta: 0, footing: { floor: restHeight(hit, radius), rise: 0 } };
  }
  const d: Dir = [direction[0] / speed, direction[1] / speed];
  const along = d[0] * hit.up[0] + d[1] * hit.up[1];
  const sign = along >= 0 ? 1 : -1;
  // Al acercarse por un extremo, solo si se va hacia la escalera.
  const entering = hit.outside === 0 || hit.outside === -sign;
  const off = Math.acos(Math.min(1, Math.abs(along)));
  const weight = entering ? within(off, ALIGN_FULL, ALIGN_CONE) : 0;
  // Cerca de las barandas, de a poco hacia la línea de paso (solo sobre el tramo).
  const toLine: [number, number] = [hit.point[0] - feet[0], hit.point[2] - feet[2]];
  const drift = Math.hypot(toLine[0], toLine[1]);
  const free = Math.max(0, hit.guide.halfWidth - EDGE);
  const pull =
    hit.outside === 0 && drift > free
      ? (Math.min(CENTER_MAX, (drift - free) * CENTER_GAIN) * weight) / drift
      : 0;
  const [x, z] = unit(
    d[0] + (hit.up[0] * sign - d[0]) * weight + toLine[0] * pull,
    d[1] + (hit.up[1] * sign - d[1]) * weight + toLine[1] * pull,
  );
  const on = hit.outside === 0;
  // En la pendiente, la velocidad a lo largo de la escalera (no la horizontal) es la de caminar.
  const ahead = restHeight(hit, radius, SLOPE_STEP);
  const behind = restHeight(hit, radius, -SLOPE_STEP);
  const rise = ((ahead - behind) / (2 * SLOPE_STEP)) * (x * hit.up[0] + z * hit.up[1]);
  const scale = speed / Math.sqrt(1 + rise * rise);
  const heading = headingOf(hit.up);
  const turn = within(off, TURN_FULL, TURN_CONE);
  const yawDelta = state.heading === null || !on ? 0 : wrap(heading - state.heading) * turn;
  state.heading = on ? heading : null;
  const footing: StairFooting = { floor: restHeight(hit, radius), rise };
  return { direction: [x * scale, z * scale], yawDelta, footing };
}
