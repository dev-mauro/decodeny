import { distance, mmToMeters, type Vec2 } from '@decodeny/domain';
import type { Vec3Tuple } from '../coords';
import { MeshBuilder, type MeshData } from './mesh-data';

export type SurfaceFacing = 'up' | 'down';

/** Región plana (mm): contorno y agujeros (p. ej. el hueco de una escalera). */
export interface SurfaceRegion {
  readonly outline: readonly Vec2[];
  readonly holes: readonly (readonly Vec2[])[];
}

/**
 * Superficie horizontal (piso o cielo) a partir de regiones en planta (mm).
 * `up` = piso visible desde arriba; `down` = cielo visible desde abajo (invisible desde
 * arriba por culling, lo que permite orbitar sobre el recinto sin ocultarlo).
 */
export function buildRegionsMesh(
  regions: readonly SurfaceRegion[],
  heightMm: number,
  facing: SurfaceFacing,
): MeshData<'surface'> {
  const builder = new MeshBuilder(['surface'] as const);
  const y = mmToMeters(heightMm);
  const sign = facing === 'up' ? 1 : -1;
  const local = (polygon: readonly Vec2[]) =>
    polygon.map((p) => ({ x: mmToMeters(p.x), y: sign * mmToMeters(p.y) }));
  for (const region of regions) {
    builder.addPolygon(
      'surface',
      { origin: [0, y, 0], u: [1, 0, 0], v: [0, 0, -sign] },
      local(region.outline),
      region.holes.map(local),
    );
  }
  return builder.build();
}

/** Superficie horizontal de un polígono sin agujeros (ver `buildRegionsMesh`). */
export function buildSurfaceMesh(
  polygon: readonly Vec2[],
  heightMm: number,
  facing: SurfaceFacing,
): MeshData<'surface'> {
  return buildRegionsMesh([{ outline: polygon, holes: [] }], heightMm, facing);
}

/**
 * Canto de una losa: caras verticales de `depthMm` bajo la altura 0 por cada borde de las
 * regiones, mirando hacia afuera de lo sólido (la fachada entre pisos y el borde de los huecos).
 * Contornos antihorarios y agujeros horarios: lo sólido queda siempre a la izquierda.
 */
export function buildSlabEdgesMesh(
  regions: readonly SurfaceRegion[],
  depthMm: number,
): MeshData<'surface'> {
  const builder = new MeshBuilder(['surface'] as const);
  const depth = mmToMeters(depthMm);
  for (const region of regions) {
    for (const ring of [region.outline, ...region.holes]) {
      for (const [i, a] of ring.entries()) {
        const b = ring[(i + 1) % ring.length]!;
        const length = mmToMeters(distance(a, b));
        if (length < 1e-4) continue;
        // u a lo largo del borde (en el mundo, el norte es −Z); u × arriba apunta afuera.
        const u: Vec3Tuple = [mmToMeters(b.x - a.x) / length, 0, -mmToMeters(b.y - a.y) / length];
        builder.addPolygon(
          'surface',
          { origin: [mmToMeters(a.x), -depth, -mmToMeters(a.y)], u, v: [0, 1, 0] },
          [
            { x: 0, y: 0 },
            { x: length, y: 0 },
            { x: length, y: depth },
            { x: 0, y: depth },
          ],
        );
      }
    }
  }
  return builder.build();
}
