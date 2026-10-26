import { add, mmToMeters, perpLeft, scale, type Vec2, type WallFootprint } from '@decodeny/domain';
import { planDirToWorld, planToWorld, type Vec3Tuple } from '../coords';
import {
  crossV3,
  MeshBuilder,
  projectOnU,
  verticalFrame,
  type MeshData,
  type PlaneFrame,
} from './mesh-data';

/**
 * Slots de material del muro. `left`/`right` son sus caras (ADR-004); `reveal` las caras
 * interiores de los vanos (jambas, dintel, peana) y `threshold` el umbral de las puertas.
 */
export const WALL_SLOTS = ['left', 'right', 'top', 'cap', 'reveal', 'threshold'] as const;
export type WallSlot = (typeof WALL_SLOTS)[number];

/** Corte de un vano en el muro (mm): centro a lo largo del eje desde `start`, ancho, alto y antepecho. */
export interface WallCut {
  readonly offset: number;
  readonly width: number;
  readonly height: number;
  readonly sill: number;
}

const UP: Vec3Tuple = [0, 1, 0];
const DOWN: Vec3Tuple = [0, -1, 0];
const negate = (v: Vec3Tuple): Vec3Tuple => [-v[0], -v[1], -v[2]];

/** Marco de un plano con normal `n` y eje `u` dado (v = n × u, de modo que u × v = n). */
const frameWithNormal = (origin: Vec3Tuple, u: Vec3Tuple, n: Vec3Tuple): PlaneFrame => ({
  origin,
  u,
  v: crossV3(n, u),
});

interface Interval {
  readonly a: number;
  readonly b: number;
  readonly cut: WallCut;
}

/**
 * Contorno de una cara con los vanos: los que arrancan del piso (puertas) se recortan del borde
 * inferior; el resto son agujeros. Coordenadas locales del marco de la cara, en metros.
 */
function faceShape(
  lo: number,
  hi: number,
  height: number,
  intervals: readonly Interval[],
): { outline: Vec2[]; holes: Vec2[][] } {
  const outline: Vec2[] = [{ x: lo, y: 0 }];
  const holes: Vec2[][] = [];
  for (const { a, b, cut } of intervals) {
    const top = mmToMeters(cut.sill + cut.height);
    if (cut.sill <= 0) {
      outline.push({ x: a, y: 0 }, { x: a, y: top }, { x: b, y: top }, { x: b, y: 0 });
    } else {
      const bottom = mmToMeters(cut.sill);
      holes.push([
        { x: a, y: bottom },
        { x: b, y: bottom },
        { x: b, y: top },
        { x: a, y: top },
      ]);
    }
  }
  outline.push({ x: hi, y: 0 }, { x: hi, y: height }, { x: lo, y: height });
  return { outline, holes };
}

/**
 * Malla de un muro a partir de su huella en planta: caras izquierda/derecha (slots de
 * material independientes), cara superior, tapas en extremos expuestos y los vanos recortados
 * con sus jambas, dintel, peana y umbral.
 */
export function buildWallMesh(
  footprint: WallFootprint,
  heightMm: number,
  cuts: readonly WallCut[] = [],
): MeshData<WallSlot> {
  const builder = new MeshBuilder(WALL_SLOTS);
  const height = mmToMeters(heightMm);
  const half = footprint.thickness / 2;
  const left = perpLeft(footprint.dir);
  const leftNormal = planDirToWorld(left);
  const dirWorld = planDirToWorld(footprint.dir);
  const axisPoint = (along: number, side = 0): Vec2 =>
    add(add(footprint.start, scale(footprint.dir, along)), scale(left, half * side));
  const sorted = [...cuts].sort((x, y) => x.offset - y.offset);

  const addFace = (slot: 'left' | 'right', sign: 1 | -1, a: Vec2, b: Vec2) => {
    const frame = verticalFrame(
      planToWorld(axisPoint(0, sign)),
      sign === 1 ? leftNormal : negate(leftNormal),
    );
    const u = (p: Vec2) => projectOnU(frame, planToWorld(p));
    const ua = u(a);
    const ub = u(b);
    const lo = Math.min(ua, ub);
    const hi = Math.max(ua, ub);
    const intervals = sorted
      .map((cut) => {
        const p = u(axisPoint(cut.offset - cut.width / 2, sign));
        const q = u(axisPoint(cut.offset + cut.width / 2, sign));
        return {
          a: Math.max(lo, Math.min(p, q)),
          b: Math.min(hi, Math.max(p, q)),
          cut,
        };
      })
      .filter((i) => i.b > i.a)
      .sort((x, y) => x.a - y.a);
    const { outline, holes } = faceShape(lo, hi, height, intervals);
    builder.addPolygon(slot, frame, outline, holes);
  };
  addFace('left', 1, footprint.startShape.left, footprint.endShape.left);
  addFace('right', -1, footprint.startShape.right, footprint.endShape.right);

  // Planta en metros: el marco horizontal mapea (x, y) → (x, h, −y) con normal +Y.
  const top = footprint.polygon.map((p) => scale(p, 0.001));
  builder.addPolygon('top', { origin: [0, height, 0], u: [1, 0, 0], v: [0, 0, -1] }, top);

  const capQuad = (frame: PlaneFrame, a: Vec2, b: Vec2) => {
    const ua = projectOnU(frame, planToWorld(a));
    const ub = projectOnU(frame, planToWorld(b));
    return [
      { x: ua, y: 0 },
      { x: ub, y: 0 },
      { x: ub, y: height },
      { x: ua, y: height },
    ];
  };
  if (footprint.startShape.capped) {
    const frame = verticalFrame(planToWorld(footprint.start), negate(dirWorld));
    builder.addPolygon(
      'cap',
      frame,
      capQuad(frame, footprint.startShape.left, footprint.startShape.right),
    );
  }
  if (footprint.endShape.capped) {
    const frame = verticalFrame(planToWorld(footprint.end), dirWorld);
    builder.addPolygon(
      'cap',
      frame,
      capQuad(frame, footprint.endShape.left, footprint.endShape.right),
    );
  }

  // Caras interiores de cada vano, a través del espesor del muro.
  const halfM = mmToMeters(half);
  for (const cut of sorted) {
    const w = mmToMeters(cut.width);
    const bottom = mmToMeters(cut.sill);
    const top = mmToMeters(cut.sill + cut.height);
    const startPoint = axisPoint(cut.offset - cut.width / 2);
    const endPoint = axisPoint(cut.offset + cut.width / 2);
    const jamb = (point: Vec2, normal: Vec3Tuple) => {
      const frame = verticalFrame(planToWorld(point), normal);
      const ua = projectOnU(frame, planToWorld(add(point, scale(left, half))));
      const ub = projectOnU(frame, planToWorld(add(point, scale(left, -half))));
      builder.addPolygon('reveal', frame, [
        { x: ua, y: bottom },
        { x: ub, y: bottom },
        { x: ub, y: top },
        { x: ua, y: top },
      ]);
    };
    jamb(startPoint, dirWorld);
    jamb(endPoint, negate(dirWorld));
    const horizontal = (y: number, normal: Vec3Tuple) => {
      const origin = planToWorld(startPoint, 0);
      return frameWithNormal([origin[0], y, origin[2]], dirWorld, normal);
    };
    // En los planos horizontales `v` cruza el espesor (en uno u otro sentido): banda simétrica.
    const band = [
      { x: 0, y: -halfM },
      { x: w, y: -halfM },
      { x: w, y: halfM },
      { x: 0, y: halfM },
    ];
    builder.addPolygon('reveal', horizontal(top, DOWN), band);
    if (cut.sill > 0) builder.addPolygon('reveal', horizontal(bottom, UP), band);
    else builder.addPolygon('threshold', horizontal(0.001, UP), band);
  }
  return builder.build();
}
