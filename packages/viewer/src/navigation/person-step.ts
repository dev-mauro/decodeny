import { horizontalDirection, type MovementIntent } from './input';
import type { PersonProfile } from './person-profile';

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
): Vec3Like {
  const [dx, dz] = horizontalDirection(intent, yaw);
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
