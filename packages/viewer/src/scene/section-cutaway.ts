import type { Vec2, WallExposure, WallFootprint } from '@decodeny/domain';

/**
 * Corte de muros: `all` recorta toda la envolvente a la altura de corte; `facing` solo los muros
 * que tapan el interior desde la cámara (los perimetrales del fondo quedan enteros).
 */
export type SectionMode = 'all' | 'facing';

/** Margen (seno del ángulo, ~5°) para que un muro casi de canto no parpadee al orbitar. */
const HYSTERESIS = Math.sin((5 * Math.PI) / 180);

/**
 * Muros a recortar con la cámara en `camera` (planta, mm). Un muro exterior se recorta si la
 * cámara está de su lado de afuera (tapa el interior); visto desde adentro queda entero. Los
 * interiores y los sueltos se recortan siempre. `previous` decide los que están casi de canto.
 */
export function facingCutWalls(
  exposure: ReadonlyMap<string, WallExposure>,
  camera: Vec2,
  previous: ReadonlySet<string>,
): Set<string> {
  const cut = new Set<string>();
  for (const [id, e] of exposure) {
    if (e.kind !== 'exterior') {
      cut.add(id);
      continue;
    }
    const dx = camera.x - e.mid.x;
    const dy = camera.y - e.mid.y;
    const distance = Math.hypot(dx, dy);
    const facing = distance === 0 ? 0 : (e.outward.x * dx + e.outward.y * dy) / distance;
    if (facing > HYSTERESIS || (facing >= -HYSTERESIS && previous.has(id))) cut.add(id);
  }
  return cut;
}

export function sameWallSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** Muro sobre el que está montado un objeto (el de eje más cercano a su posición en planta). */
export function wallAt(
  footprints: ReadonlyMap<string, WallFootprint>,
  point: Vec2,
): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const fp of footprints.values()) {
    const t = Math.max(
      0,
      Math.min(fp.length, (point.x - fp.start.x) * fp.dir.x + (point.y - fp.start.y) * fp.dir.y),
    );
    const d = Math.hypot(
      point.x - (fp.start.x + fp.dir.x * t),
      point.y - (fp.start.y + fp.dir.y * t),
    );
    if (d < bestDistance) {
      bestDistance = d;
      best = fp.wallId;
    }
  }
  return best;
}
