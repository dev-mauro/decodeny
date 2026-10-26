/** Vector/punto 2D en el plano de planta (x hacia el este, y hacia el norte). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const EPSILON = 1e-9;

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** Componente z del producto cruz: > 0 si `b` está a la izquierda de `a`. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
/** Normal izquierda (rotación +90°, antihoraria). */
export const perpLeft = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
/** Normal derecha (rotación −90°, horaria). */
export const perpRight = (a: Vec2): Vec2 => ({ x: a.y, y: -a.x });
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const fromAngle = (rad: number): Vec2 => ({ x: Math.cos(rad), y: Math.sin(rad) });
export const roundVec = (a: Vec2): Vec2 => ({ x: Math.round(a.x), y: Math.round(a.y) });

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  if (len < EPSILON) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
}

export function nearlyEqual(a: Vec2, b: Vec2, eps = 1e-6): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}
