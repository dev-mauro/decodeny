import { mmToMeters, type Vec2 } from '@decodeny/domain';
import { MeshBuilder, type MeshData } from './mesh-data';

export type SurfaceFacing = 'up' | 'down';

/**
 * Superficie horizontal (piso o cielo) a partir de un polígono en planta (mm).
 * `up` = piso visible desde arriba; `down` = cielo visible desde abajo (invisible desde
 * arriba por culling, lo que permite orbitar sobre el recinto sin ocultarlo).
 */
export function buildSurfaceMesh(
  polygon: readonly Vec2[],
  heightMm: number,
  facing: SurfaceFacing,
): MeshData<'surface'> {
  const builder = new MeshBuilder(['surface'] as const);
  const y = mmToMeters(heightMm);
  const sign = facing === 'up' ? 1 : -1;
  const local = polygon.map((p) => ({ x: mmToMeters(p.x), y: sign * mmToMeters(p.y) }));
  builder.addPolygon('surface', { origin: [0, y, 0], u: [1, 0, 0], v: [0, 0, -sign] }, local);
  return builder.build();
}
