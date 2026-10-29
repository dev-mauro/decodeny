/**
 * Altura de los ojos suavizada: al subir o bajar una escalera (o entrar a una rampa) la cámara
 * no copia cada quiebre ni cada escalón del cuerpo, sino que los acompaña con un retardo breve,
 * como la cabeza de una persona. Nunca se aleja del cuerpo más de `MAX_LAG` y un salto grande
 * (reaparecer) se toma de una vez.
 */

/** Constante de tiempo del suavizado (s). */
const TAU = 0.09;
/** Lo más que la cámara se queda atrás del cuerpo (m). */
export const MAX_LAG = 0.15;
/** Un salto mayor que este (m) no se suaviza. */
const SNAP = 1;

export interface EyeHeightState {
  y: number | null;
}

export const createEyeHeight = (): EyeHeightState => ({ y: null });

/** Avanza `dt` segundos hacia la altura `target` (m) y devuelve la altura de la cámara. */
export function stepEyeHeight(state: EyeHeightState, target: number, dt: number): number {
  if (state.y === null || Math.abs(target - state.y) > SNAP) {
    state.y = target;
    return target;
  }
  state.y += (target - state.y) * (1 - Math.exp(-dt / TAU));
  state.y = Math.min(target + MAX_LAG, Math.max(target - MAX_LAG, state.y));
  return state.y;
}
