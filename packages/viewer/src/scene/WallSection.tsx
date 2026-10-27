import {
  mmToMeters,
  openingEnvelope,
  scale,
  type Level,
  type WallFootprint,
} from '@decodeny/domain';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Plane, Vector3 } from 'three';
import { MeshBuilder } from '../builders/mesh-data';
import { toBufferGeometry } from '../builders/to-buffer-geometry';
import { surfaceMaterial } from '../materials/default-materials';
import { SECTION_PLANES } from '../materials/section-planes';
import { clipToSlab } from './section-geometry';
import { useKeyedGeometry } from './use-keyed-geometry';

/**
 * Corte horizontal de la envolvente (como un plano de arquitectura): muros, cielos y vanos se
 * recortan sobre la altura de corte y los muros cortados muestran su sección. Los muebles no se
 * cortan (ver `SECTION_PLANES`); los que quedan enteros sobre el corte se ocultan en `LevelView`.
 */
export function SectionClipping({ heightMm }: { readonly heightMm: number | null }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    gl.localClippingEnabled = true;
    SECTION_PLANES.length = 0;
    if (heightMm !== null) {
      SECTION_PLANES.push(new Plane(new Vector3(0, -1, 0), mmToMeters(heightMm)));
    }
    invalidate();
    return () => {
      SECTION_PLANES.length = 0;
      invalidate();
    };
  }, [gl, heightMm, invalidate]);
  return null;
}

/** Tramos sólidos (a lo largo del eje) de un muro a la altura de corte, sin los vanos. */
function solidSpans(level: Level, wallId: string, heightMm: number) {
  const holes = level.openings
    .filter((o) => o.wallId === wallId)
    .map((o) => ({ o, env: openingEnvelope(o) }))
    .filter(({ env }) => heightMm > env.sill && heightMm < env.sill + env.height)
    .map(({ o, env }) => [o.offset - env.width / 2, o.offset + env.width / 2] as const)
    .sort((x, y) => x[0] - y[0]);
  const spans: [number, number][] = [];
  let cursor = -Infinity;
  for (const [a, b] of holes) {
    spans.push([cursor, a]);
    cursor = b;
  }
  spans.push([cursor, Infinity]);
  return spans.filter(([a, b]) => b > a);
}

/** Secciones oscuras de los muros cortados (respetando puertas y ventanas); `walls`: solo esos. */
export function WallSectionCaps({
  level,
  footprints,
  heightMm,
  walls = null,
}: {
  readonly level: Level;
  readonly footprints: ReadonlyMap<string, WallFootprint>;
  readonly heightMm: number;
  readonly walls?: ReadonlySet<string> | null;
}) {
  const key = useMemo(
    () =>
      `${heightMm}|${walls ? [...walls].sort().join() : '*'}|${level.walls.map((w) => `${w.id}:${w.height}`).join()}|${JSON.stringify(level.openings)}|${[...footprints.values()].map((f) => f.polygon.map((p) => `${p.x},${p.y}`).join(';')).join('|')}`,
    [footprints, heightMm, level.openings, level.walls, walls],
  );
  const geometry = useKeyedGeometry(key, () => {
    const builder = new MeshBuilder(['section'] as const);
    for (const wall of level.walls) {
      const fp = footprints.get(wall.id);
      if (!fp || wall.height <= heightMm || (walls && !walls.has(wall.id))) continue;
      for (const [a, b] of solidSpans(level, wall.id, heightMm)) {
        const piece = clipToSlab(fp.polygon, fp.start, fp.dir, a, b);
        if (piece.length < 3) continue;
        builder.addPolygon(
          'section',
          // Un milímetro bajo el corte: el plano de recorte no la elimina.
          { origin: [0, mmToMeters(heightMm - 1), 0], u: [1, 0, 0], v: [0, 0, -1] },
          piece.map((p) => scale(p, 0.001)),
        );
      }
    }
    return toBufferGeometry(builder.build(), ['section']);
  });
  return <mesh geometry={geometry} material={surfaceMaterial('wallTop', 'normal')} />;
}
