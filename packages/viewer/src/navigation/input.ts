import { useEffect, useRef } from 'react';

/**
 * Intención de movimiento independiente del dispositivo. Hoy la produce el teclado; en I8 la
 * producirán también controles táctiles (joystick virtual) sin cambiar los modos.
 */
export interface MovementIntent {
  /** −1 (atrás) … 1 (adelante). */
  readonly forward: number;
  /** −1 (izquierda) … 1 (derecha). */
  readonly right: number;
  /** −1 (bajar) … 1 (subir); solo en vuelo libre. */
  readonly up: number;
  readonly run: boolean;
}

export type MovementAction = 'forward' | 'backward' | 'left' | 'right' | 'up' | 'down' | 'run';

/** Teclas por `KeyboardEvent.code` (posición física: funciona igual con teclado español). */
export type Keymap = Readonly<Record<MovementAction, readonly string[]>>;

export const DEFAULT_KEYMAP: Keymap = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['Space', 'KeyE'],
  down: ['KeyC', 'KeyQ'],
  run: ['ShiftLeft', 'ShiftRight'],
};

export const NO_MOVEMENT: MovementIntent = { forward: 0, right: 0, up: 0, run: false };

export function intentFromKeys(pressed: ReadonlySet<string>, keymap: Keymap = DEFAULT_KEYMAP) {
  const active = (action: MovementAction) => keymap[action].some((code) => pressed.has(code));
  const axis = (positive: MovementAction, negative: MovementAction) =>
    (active(positive) ? 1 : 0) - (active(negative) ? 1 : 0);
  return {
    forward: axis('forward', 'backward'),
    right: axis('right', 'left'),
    up: axis('up', 'down'),
    run: active('run'),
  } satisfies MovementIntent;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Devuelve un lector de la intención actual según las teclas presionadas. */
export function useKeyboardIntent(keymap: Keymap = DEFAULT_KEYMAP): () => MovementIntent {
  const pressed = useRef(new Set<string>());
  useEffect(() => {
    const keys = pressed.current;
    const bound = new Set(Object.values(keymap).flat());
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || !bound.has(e.code)) return;
      keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const reset = () => keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, [keymap]);
  return () => intentFromKeys(pressed.current, keymap);
}

/** Dirección horizontal (mundo) de una intención según el rumbo `yaw`. Longitud ≤ 1. */
export function horizontalDirection(intent: MovementIntent, yaw: number): [number, number] {
  // Adelante = −Z rotado por yaw; derecha = +X rotado por yaw.
  const x = -Math.sin(yaw) * intent.forward + Math.cos(yaw) * intent.right;
  const z = -Math.cos(yaw) * intent.forward - Math.sin(yaw) * intent.right;
  const length = Math.hypot(x, z);
  return length > 1 ? [x / length, z / length] : [x, z];
}
