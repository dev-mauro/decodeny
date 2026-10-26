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
      const [sx, sy, sz] = p.size;
      const r = p.rotationY ?? 0;
      const c = Math.abs(Math.cos(r));
      const s = Math.abs(Math.sin(r));
      const hx = (sx * c + sz * s) / 2;
      const hz = (sx * s + sz * c) / 2;
      extend(p.at[0] - hx, p.at[1] - sy / 2, p.at[2] - hz);
      extend(p.at[0] + hx, p.at[1] + sy / 2, p.at[2] + hz);
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

/**
 * Escala y desplaza las piezas para que su caja envolvente quede en `[-w/2, w/2] × [0, h] ×
 * [-d/2, d/2]`. Solo para cajas sin giro y cilindros (como los muebles).
 */
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
