/**
 * Árbol de primitivas independiente del motor 3D que producen los generadores del catálogo
 * (ADR-0004). Unidades: mm. El visor las convierte en mallas agrupadas por slot de material.
 */
export type Vec3Mm = readonly [number, number, number];

export interface BoxPart {
  readonly kind: 'box';
  /** Slot de material (p. ej. `frame`, `leaf`, `glass`). */
  readonly slot: string;
  /** Tamaño en el marco local (x, y, z). */
  readonly size: Vec3Mm;
  /** Centro en el marco local. */
  readonly at: Vec3Mm;
  /** Giro alrededor del eje vertical (radianes, antihorario visto desde arriba). */
  readonly rotationY?: number;
  /**
   * Inclinación alrededor del eje x local, antes del giro vertical (radianes): positiva levanta
   * el extremo −z. Pasamanos y rampas; ver `bar`.
   */
  readonly pitch?: number;
  /** Color propio (`#rrggbb`) que reemplaza al del slot, p. ej. el elegido para una alfombra. */
  readonly color?: string;
}

/** Cilindro vertical (patas, mesas redondas, artefactos sanitarios). */
export interface CylinderPart {
  readonly kind: 'cylinder';
  readonly slot: string;
  /** Radio inferior; `radiusTop` (opcional) permite troncos de cono. */
  readonly radius: number;
  readonly radiusTop?: number;
  /** Semieje en z si la sección es elíptica (p. ej. al escalar un mueble); por defecto, `radius`. */
  readonly radiusZ?: number;
  readonly height: number;
  /** Centro en el marco local. */
  readonly at: Vec3Mm;
  readonly color?: string;
}

export type Part = BoxPart | CylinderPart;

export const box = (slot: string, size: Vec3Mm, at: Vec3Mm, rotationY = 0): BoxPart =>
  rotationY === 0 ? { kind: 'box', slot, size, at } : { kind: 'box', slot, size, at, rotationY };

/** La misma pieza con un color propio. */
export const tinted = <P extends Part>(part: P, color: string): P => ({ ...part, color });

export const cylinder = (
  slot: string,
  radius: number,
  height: number,
  at: Vec3Mm,
  radiusTop?: number,
): CylinderPart =>
  radiusTop === undefined
    ? { kind: 'cylinder', slot, radius, height, at }
    : { kind: 'cylinder', slot, radius, height, at, radiusTop };

export interface PartBounds {
  readonly min: Vec3Mm;
  readonly max: Vec3Mm;
}

/**
 * Medio tamaño, en los ejes del marco, de una caja girada (inclinación y luego giro vertical,
 * como en `BoxPart`).
 */
export function boxHalfExtents(
  p: Pick<BoxPart, 'size' | 'rotationY' | 'pitch'>,
): [number, number, number] {
  const [hx, hy, hz] = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
  const C = Math.cos(p.rotationY ?? 0);
  const S = Math.sin(p.rotationY ?? 0);
  const c = Math.cos(p.pitch ?? 0);
  const s = Math.sin(p.pitch ?? 0);
  // Filas de la rotación Ry · Rx en valor absoluto, aplicadas al medio tamaño.
  return [
    Math.abs(C) * hx + Math.abs(S * s) * hy + Math.abs(S * c) * hz,
    Math.abs(c) * hy + Math.abs(s) * hz,
    Math.abs(S) * hx + Math.abs(C * s) * hy + Math.abs(C * c) * hz,
  ];
}

/**
 * Barra recta de sección cuadrada `section` cuyo eje va de `from` a `to` (pasamanos, largueros).
 * Una barra vertical se arma con `box`.
 */
export function bar(slot: string, from: Vec3Mm, to: Vec3Mm, section: number): BoxPart {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const horizontal = Math.hypot(dx, dz);
  return {
    kind: 'box',
    slot,
    size: [section, section, Math.hypot(horizontal, dy)],
    at: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    // El extremo −z de la caja apunta hacia `to`.
    rotationY: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, horizontal),
  };
}

/** Caja envolvente (en el marco local) de un conjunto de piezas. */
export function partsBounds(parts: readonly Part[]): PartBounds {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const extend = (x: number, y: number, z: number) => {
    min[0] = Math.min(min[0]!, x);
    min[1] = Math.min(min[1]!, y);
    min[2] = Math.min(min[2]!, z);
    max[0] = Math.max(max[0]!, x);
    max[1] = Math.max(max[1]!, y);
    max[2] = Math.max(max[2]!, z);
  };
  for (const p of parts) {
    if (p.kind === 'box') {
      const [hx, hy, hz] = boxHalfExtents(p);
      extend(p.at[0] - hx, p.at[1] - hy, p.at[2] - hz);
      extend(p.at[0] + hx, p.at[1] + hy, p.at[2] + hz);
    } else {
      const r = Math.max(p.radius, p.radiusTop ?? 0);
      const rz = r * ((p.radiusZ ?? p.radius) / p.radius);
      extend(p.at[0] - r, p.at[1] - p.height / 2, p.at[2] - rz);
      extend(p.at[0] + r, p.at[1] + p.height / 2, p.at[2] + rz);
    }
  }
  return { min: min as unknown as Vec3Mm, max: max as unknown as Vec3Mm };
}

/** Trazo de símbolo en planta (p. ej. arco de apertura de una puerta), en el marco local x–z. */
export interface PlanStroke {
  readonly points: readonly (readonly [number, number])[];
  readonly dashed?: boolean;
}

/** Transformación que lleva la caja envolvente de unas piezas a `w × h × d` (centrada, sobre el piso). */
export interface FitTransform {
  readonly scale: Vec3Mm;
  readonly point: (p: Vec3Mm) => Vec3Mm;
}

export function fitTransform(
  parts: readonly Part[],
  width: number,
  height: number,
  depth: number,
): FitTransform {
  const b = partsBounds(parts);
  const sx = width / Math.max(b.max[0] - b.min[0], 1e-9);
  const sy = height / Math.max(b.max[1] - b.min[1], 1e-9);
  const sz = depth / Math.max(b.max[2] - b.min[2], 1e-9);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  return {
    scale: [sx, sy, sz],
    point: (p) => [(p[0] - cx) * sx, (p[1] - b.min[1]) * sy, (p[2] - cz) * sz],
  };
}

/**
 * Escala y desplaza las piezas para que su caja envolvente quede en `[-w/2, w/2] × [0, h] ×
 * [-d/2, d/2]`. Solo para cajas sin giro y cilindros (como los muebles).
 */
export function fitParts(
  parts: readonly Part[],
  width: number,
  height: number,
  depth: number,
  transform: FitTransform = fitTransform(parts, width, height, depth),
): Part[] {
  const [sx, sy, sz] = transform.scale;
  return parts.map((p): Part => {
    if (p.kind === 'box') {
      return {
        ...p,
        size: [p.size[0] * sx, p.size[1] * sy, p.size[2] * sz],
        at: transform.point(p.at),
      };
    }
    return {
      ...p,
      radius: p.radius * sx,
      ...(p.radiusTop !== undefined ? { radiusTop: p.radiusTop * sx } : {}),
      radiusZ: (p.radiusZ ?? p.radius) * sz,
      height: p.height * sy,
      at: transform.point(p.at),
    };
  });
}
