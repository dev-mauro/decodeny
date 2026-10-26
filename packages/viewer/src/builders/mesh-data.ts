import earcut from 'earcut';
import type { Vec2 } from '@decodeny/domain';
import type { Vec3Tuple } from '../coords';

/** Malla independiente del motor: arreglos planos listos para un BufferGeometry. */
export interface MeshData<Slot extends string = string> {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  /** Rangos de índices por slot de material. */
  readonly groups: readonly {
    readonly slot: Slot;
    readonly start: number;
    readonly count: number;
  }[];
}

/**
 * Marco de un polígono plano en 3D: un punto local (a, b) se ubica en `origin + a·u + b·v`.
 * La normal resultante es `u × v`; `u` y `v` deben ser ortonormales.
 */
export interface PlaneFrame {
  readonly origin: Vec3Tuple;
  readonly u: Vec3Tuple;
  readonly v: Vec3Tuple;
}

// `+ 0` normaliza −0 a 0 para que las normales sean comparables y serializables.
export const crossV3 = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [
  a[1] * b[2] - a[2] * b[1] + 0,
  a[2] * b[0] - a[0] * b[2] + 0,
  a[0] * b[1] - a[1] * b[0] + 0,
];

const UP: Vec3Tuple = [0, 1, 0];

/** Marco de una cara vertical cuya normal (horizontal) es `normal`. */
export function verticalFrame(origin: Vec3Tuple, normal: Vec3Tuple): PlaneFrame {
  return { origin, u: crossV3(UP, normal), v: UP };
}

/** Coordenada local `u` de un punto del mundo respecto de un marco. */
export function projectOnU(frame: PlaneFrame, p: Vec3Tuple): number {
  return (
    (p[0] - frame.origin[0]) * frame.u[0] +
    (p[1] - frame.origin[1]) * frame.u[1] +
    (p[2] - frame.origin[2]) * frame.u[2]
  );
}

export class MeshBuilder<Slot extends string> {
  readonly #positions: number[] = [];
  readonly #normals: number[] = [];
  readonly #uvs: number[] = [];
  readonly #indices = new Map<Slot, number[]>();

  constructor(readonly slotOrder: readonly Slot[]) {
    for (const slot of slotOrder) this.#indices.set(slot, []);
  }

  /**
   * Agrega un polígono plano (con agujeros opcionales) en coordenadas locales del marco,
   * en metros. Las UV son las coordenadas locales: 1 unidad UV = 1 m (escala de mundo).
   */
  addPolygon(
    slot: Slot,
    frame: PlaneFrame,
    outline: readonly Vec2[],
    holes: readonly (readonly Vec2[])[] = [],
  ): void {
    const rings = [outline, ...holes];
    const flat: number[] = [];
    const holeIndices: number[] = [];
    for (const [i, ring] of rings.entries()) {
      if (i > 0) holeIndices.push(flat.length / 2);
      for (const p of ring) flat.push(p.x, p.y);
    }
    const triangles = earcut(flat, holeIndices, 2);
    if (triangles.length === 0) return;

    const base = this.#positions.length / 3;
    const normal = crossV3(frame.u, frame.v);
    for (let i = 0; i < flat.length; i += 2) {
      const a = flat[i]!;
      const b = flat[i + 1]!;
      this.#positions.push(
        frame.origin[0] + a * frame.u[0] + b * frame.v[0],
        frame.origin[1] + a * frame.u[1] + b * frame.v[1],
        frame.origin[2] + a * frame.u[2] + b * frame.v[2],
      );
      this.#normals.push(...normal);
      this.#uvs.push(a, b);
    }
    const target = this.#indices.get(slot)!;
    for (let t = 0; t < triangles.length; t += 3) {
      const i0 = triangles[t]!;
      const i1 = triangles[t + 1]!;
      const i2 = triangles[t + 2]!;
      // La normal es u × v: los triángulos deben ser antihorarios en el plano local.
      const area =
        (flat[i1 * 2]! - flat[i0 * 2]!) * (flat[i2 * 2 + 1]! - flat[i0 * 2 + 1]!) -
        (flat[i2 * 2]! - flat[i0 * 2]!) * (flat[i1 * 2 + 1]! - flat[i0 * 2 + 1]!);
      if (area >= 0) target.push(base + i0, base + i1, base + i2);
      else target.push(base + i0, base + i2, base + i1);
    }
  }

  build(): MeshData<Slot> {
    const indices: number[] = [];
    const groups: { slot: Slot; start: number; count: number }[] = [];
    for (const slot of this.slotOrder) {
      const list = this.#indices.get(slot)!;
      if (list.length === 0) continue;
      groups.push({ slot, start: indices.length, count: list.length });
      indices.push(...list);
    }
    return {
      positions: new Float32Array(this.#positions),
      normals: new Float32Array(this.#normals),
      uvs: new Float32Array(this.#uvs),
      indices: new Uint32Array(indices),
      groups,
    };
  }
}
