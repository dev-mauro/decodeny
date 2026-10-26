import { isSimplePolygon, tracePath, type PathSegment, type TracedPath } from '@decodeny/domain';

export type TurnDirection = 'left' | 'right';

/** Fila editable del recorrido por tramos. */
export interface PathRow {
  readonly key: number;
  readonly length: number;
  readonly direction: TurnDirection;
  readonly angle: number;
}

export const toSegments = (rows: readonly PathRow[]): PathSegment[] =>
  rows.map((r) => ({ length: r.length, turn: (r.direction === 'left' ? 1 : -1) * r.angle }));

export type PathStatus = 'closed' | 'open' | 'self-intersects' | 'too-few';

export interface PathAnalysis {
  readonly traced: TracedPath;
  readonly status: PathStatus;
  readonly valid: boolean;
}

export function analyzePath(rows: readonly PathRow[]): PathAnalysis {
  const traced = tracePath(toSegments(rows));
  let status: PathStatus;
  if (traced.points.length < 3) status = 'too-few';
  else if (!isSimplePolygon(traced.points)) status = 'self-intersects';
  else status = traced.closed ? 'closed' : 'open';
  return { traced, status, valid: status === 'closed' || status === 'open' };
}

let nextKey = 1;

export const createRow = (
  length: number,
  direction: TurnDirection = 'left',
  angle = 90,
): PathRow => ({
  key: nextKey++,
  length,
  direction,
  angle,
});

/** Recorrido inicial de ejemplo: rectángulo de 4,00 × 3,00 m. */
export const initialRows = (): PathRow[] => [
  createRow(4000),
  createRow(3000),
  createRow(4000),
  createRow(3000),
];
