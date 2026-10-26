import { intersectLines } from './lines';
import {
  add,
  angleOf,
  distance,
  EPSILON,
  normalize,
  perpLeft,
  perpRight,
  scale,
  sub,
  type Vec2,
} from './vec2';

export interface WallJointInput {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly thickness: number;
}

/** Extremo de un muro. `left`/`right` son relativos a la dirección del muro (start → end). */
export interface WallEndShape {
  readonly left: Vec2;
  readonly right: Vec2;
  /** Centro del nodo; presente en uniones de 3 o más muros para cerrar el contorno. */
  readonly center?: Vec2;
  /** `true` si el extremo queda expuesto y necesita una tapa (extremo libre o inglete imposible). */
  readonly capped: boolean;
}

export interface WallFootprint {
  readonly wallId: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly dir: Vec2;
  readonly length: number;
  readonly thickness: number;
  readonly startShape: WallEndShape;
  readonly endShape: WallEndShape;
  /** Contorno en planta, antihorario. */
  readonly polygon: readonly Vec2[];
}

/** Más allá de esta razón (distancia del inglete / semiespesor) se corta el inglete. */
export const MITER_LIMIT = 4;

interface Incidence {
  readonly wallId: string;
  readonly atStart: boolean;
  readonly out: Vec2;
  readonly half: number;
  readonly angle: number;
}

interface MutableEnd {
  outLeft?: Vec2;
  outRight?: Vec2;
  capped: boolean;
  center?: Vec2;
}

const endKey = (wallId: string, atStart: boolean): string => `${wallId}|${atStart ? 's' : 'e'}`;

/**
 * Calcula la huella en planta de cada muro resolviendo las uniones en cada nodo:
 * los muros incidentes se ordenan por ángulo y cada par consecutivo comparte la esquina
 * formada por la intersección de sus caras enfrentadas (inglete general, válido para
 * esquinas, uniones en T y cruces).
 */
export function computeWallFootprints(
  nodes: ReadonlyMap<string, Vec2>,
  walls: readonly WallJointInput[],
): Map<string, WallFootprint> {
  const incidences = new Map<string, Incidence[]>();
  const valid: { wall: WallJointInput; start: Vec2; end: Vec2; dir: Vec2; length: number }[] = [];

  for (const wall of walls) {
    const start = nodes.get(wall.start);
    const end = nodes.get(wall.end);
    if (!start || !end || wall.start === wall.end) continue;
    const length = distance(start, end);
    if (length < EPSILON) continue;
    const dir = normalize(sub(end, start));
    valid.push({ wall, start, end, dir, length });
    const half = wall.thickness / 2;
    const back = scale(dir, -1);
    pushIncidence(incidences, wall.start, {
      wallId: wall.id,
      atStart: true,
      out: dir,
      half,
      angle: angleOf(dir),
    });
    pushIncidence(incidences, wall.end, {
      wallId: wall.id,
      atStart: false,
      out: back,
      half,
      angle: angleOf(back),
    });
  }

  const ends = new Map<string, MutableEnd>();
  for (const [nodeId, list] of incidences) {
    const p = nodes.get(nodeId)!;
    list.sort((a, b) => a.angle - b.angle);
    for (const inc of list) {
      ends.set(endKey(inc.wallId, inc.atStart), {
        capped: list.length === 1,
        ...(list.length >= 3 ? { center: p } : {}),
      });
    }
    if (list.length === 1) {
      const only = list[0]!;
      const e = ends.get(endKey(only.wallId, only.atStart))!;
      e.outLeft = add(p, scale(perpLeft(only.out), only.half));
      e.outRight = add(p, scale(perpRight(only.out), only.half));
      continue;
    }
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      const b = list[(i + 1) % list.length]!;
      const ea = ends.get(endKey(a.wallId, a.atStart))!;
      const eb = ends.get(endKey(b.wallId, b.atStart))!;
      const aLeft = add(p, scale(perpLeft(a.out), a.half));
      const bRight = add(p, scale(perpRight(b.out), b.half));
      const corner = intersectLines(aLeft, a.out, bRight, b.out);
      const limit = MITER_LIMIT * Math.max(a.half, b.half);
      if (corner && distance(corner, p) <= limit) {
        ea.outLeft = corner;
        eb.outRight = corner;
      } else {
        ea.outLeft = aLeft;
        eb.outRight = bRight;
        // Muros colineales que continúan no necesitan tapa; un inglete imposible sí.
        const collinear = corner === null && Math.abs(a.angle - b.angle) > EPSILON;
        if (!collinear) {
          ea.capped = true;
          eb.capped = true;
        }
      }
    }
  }

  const result = new Map<string, WallFootprint>();
  for (const { wall, start, end, dir, length } of valid) {
    const s = ends.get(endKey(wall.id, true))!;
    const e = ends.get(endKey(wall.id, false))!;
    // En el inicio la salida coincide con la dirección del muro; en el final está invertida.
    const startShape: WallEndShape = {
      left: s.outLeft!,
      right: s.outRight!,
      capped: s.capped,
      ...(s.center ? { center: s.center } : {}),
    };
    const endShape: WallEndShape = {
      left: e.outRight!,
      right: e.outLeft!,
      capped: e.capped,
      ...(e.center ? { center: e.center } : {}),
    };
    const polygon: Vec2[] = [startShape.right, endShape.right];
    if (endShape.center) polygon.push(endShape.center);
    polygon.push(endShape.left, startShape.left);
    if (startShape.center) polygon.push(startShape.center);
    result.set(wall.id, {
      wallId: wall.id,
      start,
      end,
      dir,
      length,
      thickness: wall.thickness,
      startShape,
      endShape,
      polygon,
    });
  }
  return result;
}

function pushIncidence(map: Map<string, Incidence[]>, nodeId: string, inc: Incidence): void {
  const list = map.get(nodeId);
  if (list) list.push(inc);
  else map.set(nodeId, [inc]);
}
