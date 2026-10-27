/**
 * Balanceo de cabeza al caminar (opcional, apagado por defecto: puede marear). La cámara sube y
 * baja una vez por paso; la amplitud crece con la velocidad y se apaga suavemente al detenerse.
 */

/** Largo de un paso (m): un ciclo de subida y bajada. */
export const STEP_LENGTH = 0.7;
/** Amplitud a velocidad de caminata (m). */
export const BOB_AMPLITUDE = 0.025;
/** Velocidad de caminata de referencia (m/s). */
const WALK_SPEED = 1.4;

export interface HeadBobState {
  /** Fase del paso (radianes). */
  phase: number;
  /** Amplitud actual (m), suavizada. */
  amplitude: number;
}

export const createHeadBob = (): HeadBobState => ({ phase: 0, amplitude: 0 });

/**
 * Avanza el balanceo `dt` segundos a `speed` m/s (horizontal) y devuelve el desplazamiento
 * vertical de la cámara (m). Muta `state`.
 */
export function stepHeadBob(state: HeadBobState, speed: number, dt: number): number {
  const target = speed > 0.05 ? BOB_AMPLITUDE * Math.min(speed / WALK_SPEED, 1.5) : 0;
  // Suavizado exponencial (~0,15 s) para no saltar al empezar o detenerse.
  const k = 1 - Math.exp(-dt / 0.15);
  state.amplitude += (target - state.amplitude) * k;
  state.phase = (state.phase + (2 * Math.PI * speed * dt) / STEP_LENGTH) % (2 * Math.PI);
  // |sin|: la cabeza baja en cada apoyo (dos por ciclo de piernas, uno por paso).
  return state.amplitude * (Math.abs(Math.sin(state.phase)) - 0.5);
}
