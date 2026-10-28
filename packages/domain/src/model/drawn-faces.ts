import {
  add,
  cross,
  dot,
  intersectLines,
  isCounterClockwise,
  normalize,
  perpLeft,
  scale,
  sub,
  type Vec2,
} from '../geometry';
import {
  nodePositions,
  requireNodePosition,
  roomCenterlinePolygon,
  roomEdges,
  roomsOfWall,
} from './queries';
import type { Level, Room } from './types';

/**
 * Dibujo de muros por la cara interior (lápiz). Lo que la persona traza es el **interior** del
 * espacio: un rectángulo de 2 × 1 m dibujado debe dejar 2 × 1 m libres entre muro y muro, no
 * (2 − espesor) × (1 − espesor). Mientras la cadena está abierta no se sabe de qué lado queda el
 * interior; al cerrarse un espacio sí, y entonces sus muros recién dibujados se corren hacia afuera
 * medio espesor y se recalculan las esquinas.
 *
 * - Muros recién dibujados (sobre la cadena) que solo bordean este espacio: su línea pasa a ser
 *   su cara interior.
 * - Si la cadena empezó sobre un muro existente, las medidas cuentan desde la **cara** de ese muro
 *   (todo lo dibujado se aleja medio espesor de él). Las uniones en T con muros existentes se
 *   deslizan sobre ellos; las esquinas que ya existían no se mueven.
 * - Los muros que bordean dos espacios (un tabique que divide) quedan donde se dibujaron.
 */

/** Distancia (mm) para considerar que un nodo está sobre la cadena dibujada. */
const ON_CHAIN = 2;

interface Line {
  readonly point: Vec2;
  readonly dir: Vec2;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  const q = add(a, scale(ab, t));
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Posición a lo largo de la cadena (índice de tramo + fracción): para saber qué vino antes. */
function chainParam(chain: readonly Vec2[], p: Vec2): number | null {
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = chain[i]!;
    const b = chain[i + 1]!;
    if (distanceToSegment(p, a, b) > ON_CHAIN) continue;
    const ab = sub(b, a);
    const len2 = dot(ab, ab);
    return i + (len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2)));
  }
  return null;
}

const meet = (a: Line, b: Line): Vec2 | null => intersectLines(a.point, a.dir, b.point, b.dir);

/**
 * Ajusta el espacio recién cerrado a las caras dibujadas (ver arriba). `chain`: los puntos de la
 * cadena tal como se dibujaron (eje). Devuelve si movió algún nodo.
 */
export function fitRoomToDrawnFaces(level: Level, room: Room, chain: readonly Vec2[]): boolean {
  if (chain.length < 2) return false;
  const positions = nodePositions(level);
  const at = (id: string) => requireNodePosition(positions, id);
  const edges = roomEdges(level, room);
  const n = edges.length;
  // Lado interior: a la izquierda de cada borde si el contorno es antihorario.
  const ccw = isCounterClockwise(roomCenterlinePolygon(level, room));
  const inward = (dir: Vec2) => (ccw ? perpLeft(dir) : scale(perpLeft(dir), -1));

  const info = edges.map((e) => {
    const a = at(e.from);
    const b = at(e.to);
    const dir = normalize(sub(b, a));
    const drawn =
      e.wall !== undefined &&
      roomsOfWall(level, e.wall.id).length === 1 &&
      chainParam(chain, a) !== null &&
      chainParam(chain, b) !== null;
    return { edge: e, a, b, dir, half: (e.wall?.thickness ?? 0) / 2, drawn };
  });
  if (!info.some((i) => i.drawn)) return false;
  const allDrawn = info.every((i) => i.drawn);

  /**
   * Un nodo entre un borde dibujado y uno existente se puede deslizar sobre el existente solo si
   * es una unión en T (los muros existentes que llegan a él siguen recto). Si es una esquina que
   * ya existía, queda fijo.
   */
  const slides = (nodeId: string, fixedDir: Vec2): boolean => {
    const others = level.walls.filter(
      (w) =>
        (w.start === nodeId || w.end === nodeId) &&
        !info.some((i) => i.drawn && i.edge.wall?.id === w.id),
    );
    return others.every((w) => {
      const other = w.start === nodeId ? w.end : w.start;
      return Math.abs(cross(normalize(sub(at(other), at(nodeId))), fixedDir)) < 1e-6;
    });
  };

  // Desplazamiento de lo dibujado: desde la cara del muro existente donde empezó la cadena.
  let shift: Vec2 = { x: 0, y: 0 };
  if (!allDrawn) {
    let best: { param: number; fixed: (typeof info)[number]; node: string } | null = null;
    for (let i = 0; i < n; i++) {
      const cur = info[i]!;
      const prev = info[(i - 1 + n) % n]!;
      // Nodo de borde de una tirada dibujada: entre un borde existente y uno dibujado.
      const pairs: [typeof cur, typeof cur, string][] = [];
      if (cur.drawn && !prev.drawn) pairs.push([cur, prev, cur.edge.from]);
      if (!cur.drawn && prev.drawn) pairs.push([prev, cur, cur.edge.from]);
      for (const [, fixed, node] of pairs) {
        const param = chainParam(chain, at(node));
        if (param === null) continue;
        if (!best || param < best.param) best = { param, fixed, node };
      }
    }
    if (best && slides(best.node, best.fixed.dir)) {
      shift = scale(inward(best.fixed.dir), best.fixed.half);
    }
  }

  // Línea final del eje de cada borde dibujado: su cara interior es la línea dibujada.
  const target: (Line | null)[] = info.map((i) =>
    i.drawn ? { point: add(add(i.a, shift), scale(inward(i.dir), -i.half)), dir: i.dir } : null,
  );

  const moves = new Map<string, Vec2>();
  for (let k = 0; k < n; k++) {
    const prev = info[(k - 1 + n) % n]!;
    const cur = info[k]!;
    const node = cur.edge.from;
    const prevLine = target[(k - 1 + n) % n] ?? null;
    const curLine = target[k] ?? null;
    if (prevLine && curLine) {
      // Esquina entre dos bordes dibujados (o tramo recto partido: mismo corrimiento).
      moves.set(node, meet(prevLine, curLine) ?? add(curLine.point, sub(at(node), cur.a)));
    } else if (prevLine || curLine) {
      // Unión con un muro existente: se desliza sobre su eje, si es una T.
      const fixed = prevLine ? cur : prev;
      const drawnLine = (prevLine ?? curLine)!;
      if (!slides(node, fixed.dir)) continue;
      const point = meet(drawnLine, { point: fixed.a, dir: fixed.dir });
      if (point) moves.set(node, point);
    }
  }

  let moved = false;
  for (const node of level.nodes) {
    const p = moves.get(node.id);
    if (!p) continue;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x !== node.x || y !== node.y) moved = true;
    node.x = x;
    node.y = y;
  }
  return moved;
}
