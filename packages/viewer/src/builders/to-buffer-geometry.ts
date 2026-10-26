import { BufferAttribute, BufferGeometry } from 'three';
import type { MeshData } from './mesh-data';

/** Convierte `MeshData` a `BufferGeometry`; el índice de material es la posición del slot. */
export function toBufferGeometry<Slot extends string>(
  data: MeshData<Slot>,
  slotOrder: readonly Slot[],
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(data.uvs, 2));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  for (const group of data.groups) {
    geometry.addGroup(group.start, group.count, slotOrder.indexOf(group.slot));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
