import { levelBounds, mmToMeters, type Level } from '@decodeny/domain';
import { Box3, Vector3 } from 'three';

/** Caja envolvente (metros, mundo) de lo construido en un nivel; `null` si está vacío. */
export function levelWorldBounds(level: Level): Box3 | null {
  const b = levelBounds(level);
  if (!b) return null;
  const height = Math.max(0, ...level.walls.map((w) => w.height));
  const base = mmToMeters(level.elevation);
  return new Box3(
    new Vector3(mmToMeters(b.min.x), base, -mmToMeters(b.max.y)),
    new Vector3(mmToMeters(b.max.x), base + mmToMeters(height), -mmToMeters(b.min.y)),
  );
}
