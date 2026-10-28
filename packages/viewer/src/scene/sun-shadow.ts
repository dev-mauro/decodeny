import type { Box3 } from 'three';
import type { Vec3Tuple } from '../coords';

/**
 * Encuadre de la sombra del sol: la cámara ortográfica de la sombra cubre justo la caja del
 * nivel vista desde el sol (no un cuadrado holgado), así cada texel del mapa es lo más chico
 * posible; los sesgos se calculan con ese tamaño (sin rayas de *acne* ni sombras despegadas).
 */
export interface SunShadowFrame {
  readonly position: Vec3Tuple;
  readonly target: Vec3Tuple;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly near: number;
  readonly far: number;
  /** Corrimiento a lo largo de la normal (m) al consultar el mapa: ~1,5 texels. */
  readonly normalBias: number;
  readonly bias: number;
}

/** Hacia dónde está el sol desde la escena (sin normalizar): alto, del noreste de la vista. */
export const SUN_DIRECTION: Vec3Tuple = [0.6, 1.6, 0.9];

const MARGIN = 0.5;

type V = readonly [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export function sunShadowFrame(
  bounds: Box3,
  mapSize: number,
  direction: Vec3Tuple = SUN_DIRECTION,
): SunShadowFrame {
  const toSun = normalize(direction);
  const center: V = [
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  ];
  const radius = Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  const position: V = [
    center[0] + toSun[0] * (radius + 5),
    center[1] + toSun[1] * (radius + 5),
    center[2] + toSun[2] * (radius + 5),
  ];
  // Base de la cámara del sol (mira hacia −toSun, con el "arriba" del mundo de referencia).
  const forward: V = [-toSun[0], -toSun[1], -toSun[2]];
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < 8; i++) {
    const corner: V = [
      i & 1 ? bounds.max.x : bounds.min.x,
      i & 2 ? bounds.max.y : bounds.min.y,
      i & 4 ? bounds.max.z : bounds.min.z,
    ];
    const fromCenter = sub(corner, center);
    const x = dot(fromCenter, right);
    const y = dot(fromCenter, up);
    const z = dot(sub(corner, position), forward);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  // Cuadrado (texels iguales en ambos ejes) y redondeado a texels: estable si cambia poco.
  const half = Math.max(maxX - minX, maxY - minY) / 2 + MARGIN;
  const texel = (2 * half) / mapSize;
  const snap = (v: number) => Math.round(v / texel) * texel;
  const cx = snap((minX + maxX) / 2);
  const cy = snap((minY + maxY) / 2);
  return {
    position: [position[0], position[1], position[2]],
    target: [center[0], center[1], center[2]],
    left: cx - half,
    right: cx + half,
    bottom: cy - half,
    top: cy + half,
    near: Math.max(0.1, minZ - MARGIN),
    far: maxZ + MARGIN,
    normalBias: texel * 1.5,
    bias: -0.0001,
  };
}
