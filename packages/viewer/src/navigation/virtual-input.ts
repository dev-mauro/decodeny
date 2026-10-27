import { useKeyboardIntent, type Keymap, type MovementIntent } from './input';

/**
 * Entrada virtual (controles táctiles): la escriben los controles en pantalla y la leen los
 * modos de navegación junto con el teclado. Es mutable a propósito: cambia en cada evento táctil
 * y se lee en cada cuadro, sin pasar por React.
 */
export interface VirtualInput {
  /** Joystick: x a la derecha, y adelante, en −1 … 1 (largo ≤ 1). */
  move: { x: number; y: number };
  /** −1 (bajar) … 1 (subir): botones del vuelo libre. */
  up: number;
  run: boolean;
  /** Giro de la mirada acumulado (px de pantalla) desde la última lectura. */
  look: { dx: number; dy: number };
}

export const createVirtualInput = (): VirtualInput => ({
  move: { x: 0, y: 0 },
  up: 0,
  run: false,
  look: { dx: 0, dy: 0 },
});

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** Une la intención del teclado con la del joystick: suma por eje, limitada a −1 … 1. */
export function combineIntent(
  keys: MovementIntent,
  input: VirtualInput | undefined,
): MovementIntent {
  if (!input) return keys;
  return {
    forward: clamp(keys.forward + input.move.y),
    right: clamp(keys.right + input.move.x),
    up: clamp(keys.up + input.up),
    run: keys.run || input.run,
  };
}

/** Devuelve y pone en cero el giro de mirada acumulado. */
export function consumeLook(input: VirtualInput | undefined): { dx: number; dy: number } | null {
  if (!input || (input.look.dx === 0 && input.look.dy === 0)) return null;
  const delta = { ...input.look };
  input.look.dx = 0;
  input.look.dy = 0;
  return delta;
}

/**
 * Posición del joystick: el desplazamiento del dedo (px) desde el centro, limitado al radio.
 * Devuelve el vector normalizado (y hacia adelante = dedo hacia arriba) y si se corre (dedo en el
 * borde).
 */
export function joystickVector(
  dx: number,
  dy: number,
  radius: number,
): { x: number; y: number; run: boolean; knob: { x: number; y: number } } {
  const distance = Math.hypot(dx, dy);
  const k = distance > radius ? radius / distance : 1;
  const knob = { x: dx * k, y: dy * k };
  // Zona muerta pequeña para no derivar al apoyar el dedo.
  const dead = radius * 0.12;
  if (distance < dead) return { x: 0, y: 0, run: false, knob };
  return {
    x: knob.x / radius,
    y: -knob.y / radius,
    run: distance >= radius * 0.98,
    knob,
  };
}

/** Lector de la intención de movimiento: teclado y, si hay, controles táctiles. */
export function useMovementIntent(
  input: VirtualInput | undefined,
  keymap?: Keymap,
): () => MovementIntent {
  const readKeys = useKeyboardIntent(keymap);
  return () => combineIntent(readKeys(), input);
}
