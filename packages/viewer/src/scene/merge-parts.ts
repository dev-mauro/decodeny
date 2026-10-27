import type { Part } from '@decodeny/domain';
import { BoxGeometry, CylinderGeometry, Matrix4, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { partGeometry } from './part-geometry';

/** Piezas que comparten material, fusionadas en una sola geometría (una draw call). */
export interface MergedParts {
  readonly key: string;
  readonly slot: string;
  readonly color: string | undefined;
  readonly geometry: BufferGeometry;
}

/** Geometría de una pieza ya ubicada en el marco del objeto (m). */
function placedGeometry(part: Part, zSign: 1 | -1): BufferGeometry {
  const g = partGeometry(part, zSign);
  const geometry = g.kind === 'box' ? new BoxGeometry(...g.args) : new CylinderGeometry(...g.args);
  const m = new Matrix4();
  if (g.kind === 'box') m.makeRotationY(g.rotationY);
  else m.makeScale(1, 1, g.scaleZ);
  m.setPosition(...g.position);
  geometry.applyMatrix4(m);
  return geometry;
}

/**
 * Agrupa las piezas de un objeto por material (slot + color) y fusiona cada grupo: un mueble de
 * doce piezas en tres materiales se dibuja con tres draw calls (más las de sus sombras) en vez de
 * doce. El objeto sigue siendo uno solo para seleccionar, resaltar y arrastrar.
 */
export function mergeParts(parts: readonly Part[], zSign: 1 | -1 = 1): MergedParts[] {
  const groups = new Map<string, { slot: string; color: string | undefined; parts: Part[] }>();
  for (const part of parts) {
    const key = `${part.slot}|${part.color ?? ''}`;
    const group = groups.get(key) ?? { slot: part.slot, color: part.color, parts: [] };
    group.parts.push(part);
    groups.set(key, group);
  }
  return [...groups].map(([key, group]) => {
    const pieces = group.parts.map((p) => placedGeometry(p, zSign));
    const merged = pieces.length === 1 ? pieces[0]! : mergeGeometries(pieces, false);
    if (pieces.length > 1) pieces.forEach((p) => p.dispose());
    return { key, slot: group.slot, color: group.color, geometry: merged };
  });
}
