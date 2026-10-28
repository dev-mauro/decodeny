import { horizontalDirection, type MovementIntent } from './input';
import { capsuleDimensions, type PersonProfile } from './person-profile';

export const GRAVITY = 9.81;
export const MAX_FALL_SPEED = 20;

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Subconjunto del controlador cinemático de Rapier que usa el paso (facilita tests). */
export interface CharacterControllerLike<TCollider> {
  computeColliderMovement(collider: TCollider, desired: Vec3Like): void;
  computedMovement(): Vec3Like;
  computedGrounded(): boolean;
}

export interface PersonMotionState {
  verticalSpeed: number;
}

/**
 * Un paso de simulación de la persona: aplica la intención según el rumbo, la gravedad, y
 * deja que el controlador resuelva colisiones (deslizarse por muros, subir escalones).
 * Devuelve la posición siguiente del centro de la cápsula.
 */
export function stepPerson<TCollider>(
  controller: CharacterControllerLike<TCollider>,
  collider: TCollider,
  position: Vec3Like,
  state: PersonMotionState,
  intent: MovementIntent,
  yaw: number,
  profile: PersonProfile,
  dt: number,
  /** Dirección que reemplaza a la de las teclas (sobre una escalera, su línea de paso). */
  direction?: readonly [number, number],
): Vec3Like {
  const [dx, dz] = direction ?? horizontalDirection(intent, yaw);
  const speed = intent.run ? profile.runSpeed : profile.walkSpeed;
  state.verticalSpeed = Math.max(-MAX_FALL_SPEED, state.verticalSpeed - GRAVITY * dt);
  controller.computeColliderMovement(collider, {
    x: dx * speed * dt,
    y: state.verticalSpeed * dt,
    z: dz * speed * dt,
  });
  if (controller.computedGrounded()) state.verticalSpeed = 0;
  const move = controller.computedMovement();
  return { x: position.x + move.x, y: position.y + move.y, z: position.z + move.z };
}

/** Pendiente máxima que se sube caminando (rampas, escaleras caracol): 50°. */
export const MAX_SLOPE_CLIMB = (50 * Math.PI) / 180;

/** Ajustes del controlador cinemático de Rapier que usa el recorrido. */
export interface ConfigurableController {
  enableAutostep(maxHeight: number, minWidth: number, includeDynamicBodies: boolean): void;
  enableSnapToGround(distance: number): void;
  setSlideEnabled(enabled: boolean): void;
  setMaxSlopeClimbAngle(angle: number): void;
  setMinSlopeSlideAngle(angle: number): void;
}

/**
 * Configura el controlador como la persona del perfil: sube escalones hasta `maxStepMm`, se
 * pega al piso al bajar, se desliza por los muros y sube pendientes de hasta 50° sin resbalar.
 */
export function configurePersonController(c: ConfigurableController, profile: PersonProfile): void {
  c.enableAutostep(profile.maxStepMm / 1000, capsuleDimensions(profile).radius, false);
  c.enableSnapToGround(0.3);
  c.setSlideEnabled(true);
  c.setMaxSlopeClimbAngle(MAX_SLOPE_CLIMB);
  c.setMinSlopeSlideAngle(MAX_SLOPE_CLIMB);
}
