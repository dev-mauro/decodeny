import { mmToMeters, type Vec2 } from '@decodeny/domain';

export type Vec3Tuple = [number, number, number];

/**
 * Conversión planta → mundo (ver ADR-002): planta en mm con (x este, y norte);
 * mundo Three.js en metros con Y hacia arriba. El norte de la planta es −Z.
 */
export function planToWorld(p: Vec2, heightMm = 0): Vec3Tuple {
  return [mmToMeters(p.x), mmToMeters(heightMm), -mmToMeters(p.y)];
}

/** Dirección en planta → dirección en mundo (sin componente vertical). */
export function planDirToWorld(d: Vec2): Vec3Tuple {
  return [d.x, 0, -d.y];
}
