import { degToRad } from '../units/angle';
import { add, distance, fromAngle, scale, type Vec2 } from './vec2';

/** Un tramo de un recorrido "tortuga": avanzar `length` y luego girar `turn` grados. */
export interface PathSegment {
  /** Largo del tramo en mm. */
  readonly length: number;
  /** Giro tras el tramo en grados; positivo = izquierda (antihorario). */
  readonly turn: number;
}

export interface TracedPath {
  /** Vértices del polígono (inicio de cada tramo), sin repetir el primero. */
  readonly points: Vec2[];
  /** Distancia entre el final del recorrido y el punto de partida (0 si cierra). */
  readonly closingGap: number;
  /** `true` si el recorrido cierra dentro de la tolerancia. */
  readonly closed: boolean;
}

export const PATH_CLOSE_TOLERANCE_MM = 10;

/**
 * Traza un recorrido desde `origin` con rumbo inicial `heading` (grados, 0 = este).
 * Si el último punto coincide con el origen (dentro de la tolerancia) se descarta.
 * Si no cierra, el polígono queda cerrado por un tramo recto implícito hacia el origen.
 */
export function tracePath(
  segments: readonly PathSegment[],
  origin: Vec2 = { x: 0, y: 0 },
  heading = 0,
  tolerance = PATH_CLOSE_TOLERANCE_MM,
): TracedPath {
  const points: Vec2[] = [origin];
  let cursor = origin;
  let angle = heading;
  for (const segment of segments) {
    cursor = add(cursor, scale(fromAngle(degToRad(angle)), segment.length));
    points.push(cursor);
    angle += segment.turn;
  }
  const end = points[points.length - 1]!;
  const gap = distance(end, origin);
  const closed = segments.length > 0 && gap <= tolerance;
  if (closed) points.pop();
  return { points, closingGap: closed ? 0 : gap, closed };
}
