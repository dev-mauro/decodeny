import { Box3, Vector3, type Vector3Like } from 'three';

/**
 * Rango de profundidad de la cámara (m). Con `near` 5 cm y `far` 2 km fijos, la precisión del
 * buffer de profundidad no separa milímetros a distancia de edición: el piso, una alfombra y el
 * plano de sombra bajo los pisos "pelean" (parpadean). Se ajusta a lo que hay que ver: `near` lo
 * más lejos posible sin cortar la escena y `far` lo justo para la escena y el suelo alrededor.
 */
export interface DepthRange {
  readonly near: number;
  readonly far: number;
}

/** El suelo y su cuadrícula se ven hasta ~90 m (se desvanecen antes): `far` nunca menos. */
const MIN_FAR = 100;
/** Margen alrededor de lo construido (objetos ubicándose afuera, cuerpos de otros participantes). */
const MARGIN = 2;

const corner = new Vector3();
const grown = new Box3();

export function depthRange(eye: Vector3Like, bounds: Box3 | null, minNear = 0.05): DepthRange {
  if (!bounds || bounds.isEmpty()) return { near: minNear, far: MIN_FAR * 2 };
  grown.copy(bounds).expandByScalar(MARGIN);
  const point = new Vector3(eye.x, eye.y, eye.z);
  let farthest = 0;
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? grown.max.x : grown.min.x,
      i & 2 ? grown.max.y : grown.min.y,
      i & 4 ? grown.max.z : grown.min.z,
    );
    farthest = Math.max(farthest, corner.distanceTo(point));
  }
  // Nada de la escena está más cerca que la caja: `near` puede llegar a la mitad de esa distancia.
  const near = Math.max(minNear, grown.distanceToPoint(point) * 0.5);
  const far = Math.max(MIN_FAR, farthest * 1.5, near * 10);
  return { near, far };
}

/** ¿Vale la pena actualizar la proyección? (evita recalcularla por cambios mínimos). */
export function rangeChanged(current: DepthRange, next: DepthRange): boolean {
  const off = (a: number, b: number) => Math.abs(a - b) > b * 0.05;
  return off(current.near, next.near) || off(current.far, next.far);
}
