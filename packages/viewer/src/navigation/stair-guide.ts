import { itemBase, resolveItemDefinition } from '@decodeny/catalog';
import { itemLocalToPlan, resolveParams, type Level } from '@decodeny/domain';
import { planToWorld, type Vec3Tuple } from '../coords';

/**
 * Guía de las escaleras en el recorrido (I12): sobre una escalera, adelante y atrás siguen su
 * línea de paso (`walkPath`), sin chocar con bordes ni barandas; la mirada gira con ella (en un
 * caracol, la persona va mirando hacia donde sube).
 */
export interface StairGuide {
  readonly id: string;
  /** Línea de paso en el mundo (m), de abajo hacia arriba. */
  readonly points: readonly Vec3Tuple[];
}

/** Las guías de todas las escaleras de las plantas. */
export function stairGuides(levels: readonly Level[]): StairGuide[] {
  return levels.flatMap((level) =>
    level.items.flatMap((item): StairGuide[] => {
      const definition = resolveItemDefinition(item.def);
      const path = definition.walkPath?.(resolveParams(definition.params, item.params));
      if (!path || path.length < 2) return [];
      const base = level.elevation + itemBase(level, item);
      return [
        {
          id: item.id,
          points: path.map(([x, y, z]) => planToWorld(itemLocalToPlan(item, x, z), base + y)),
        },
      ];
    }),
  );
}

export interface GuideHit {
  readonly guide: StairGuide;
  /** Punto de la línea más cercano (m). */
  readonly point: Vec3Tuple;
  /** Dirección horizontal de subida en ese punto (unitaria, x–z). */
  readonly up: readonly [number, number];
}

/** A qué distancia (m) de la línea, en planta y en altura, se está "sobre la escalera". */
const ON_GUIDE_H = 0.45;
const ON_GUIDE_V = 0.45;

/**
 * La escalera bajo los pies (mundo, m), si se está sobre su línea de paso: cerca en planta y en
 * altura, y entre sus extremos (antes del primer peldaño o pasado el último se camina libre).
 */
export function guideAt(guides: readonly StairGuide[], feet: Vec3Tuple): GuideHit | null {
  let best: (GuideHit & { readonly distance: number }) | null = null;
  for (const guide of guides) {
    const pts = guide.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-9) continue;
      const raw = ((feet[0] - a[0]) * dx + (feet[2] - a[2]) * dz) / len2;
      // Fuera de los extremos de la escalera no guía.
      if ((i === 0 && raw < 0) || (i === pts.length - 2 && raw > 1)) continue;
      const t = Math.max(0, Math.min(1, raw));
      const point: Vec3Tuple = [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t];
      const distance = Math.hypot(feet[0] - point[0], feet[2] - point[2]);
      if (distance > ON_GUIDE_H || Math.abs(feet[1] - point[1]) > ON_GUIDE_V) continue;
      if (best && best.distance <= distance) continue;
      const len = Math.sqrt(len2);
      best = { guide, point, up: [dx / len, dz / len], distance };
    }
  }
  return best;
}

/** Rumbo (yaw) cuya dirección "adelante" es `dir` (x–z). */
export const headingOf = (dir: readonly [number, number]): number => Math.atan2(-dir[0], -dir[1]);

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Cuánto se corrige hacia la línea de paso por metro que la persona se haya desviado. */
const PULL = 2;

export interface GuidedStep {
  /** Dirección horizontal del movimiento (x–z), de largo ≤ 1. */
  readonly direction: [number, number];
  /** Cuánto giró el tramo desde el paso anterior (radianes): la mirada gira lo mismo. */
  readonly yawDelta: number;
}

/** Lo que la guía recuerda entre pasos mientras se avanza por una escalera. */
export interface GuideState {
  /** Sentido elegido al empezar a avanzar (1 sube, −1 baja), con la tecla que lo eligió. */
  sense: { readonly forward: number; readonly sign: number } | null;
  /** Rumbo del tramo en el paso anterior. */
  heading: number | null;
}

export const newGuideState = (): GuideState => ({ sense: null, heading: null });

/**
 * Sobre una escalera, adelante va por la línea de paso hacia donde se miraba al empezar (subir o
 * bajar) y atrás al revés; los costados no cuentan. El sentido se mantiene mientras se sostiene
 * la tecla (mirar a un costado no lo invierte) y la mirada solo gira lo que gira el tramo: se
 * puede mirar libremente. Devuelve `null` si no se está sobre una o no se avanza ni retrocede.
 */
export function guidedStep(
  guides: readonly StairGuide[],
  feet: Vec3Tuple,
  forward: number,
  yaw: number,
  state: GuideState,
): GuidedStep | null {
  const hit = forward === 0 ? null : guideAt(guides, feet);
  if (!hit) {
    state.sense = null;
    state.heading = null;
    return null;
  }
  if (state.sense?.forward !== Math.sign(forward)) {
    const view: [number, number] = [-Math.sin(yaw), -Math.cos(yaw)];
    const facingUp = view[0] * hit.up[0] + view[1] * hit.up[1] >= 0 ? 1 : -1;
    state.sense = { forward: Math.sign(forward), sign: Math.sign(forward) * facingUp };
  }
  const sign = state.sense.sign;
  // Volver a la línea de paso si la persona se corrió.
  let x = hit.up[0] * sign + (hit.point[0] - feet[0]) * PULL;
  let z = hit.up[1] * sign + (hit.point[2] - feet[2]) * PULL;
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  const heading = headingOf(hit.up);
  const yawDelta = state.heading === null ? 0 : wrap(heading - state.heading);
  state.heading = heading;
  return { direction: [x, z], yawDelta };
}
