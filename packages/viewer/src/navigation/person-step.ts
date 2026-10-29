import { horizontalDirection, type MovementIntent } from './input';
import { capsuleDimensions, type PersonProfile } from './person-profile';

export const GRAVITY = 9.81;
export const MAX_FALL_SPEED = 20;

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Grupos de colisión (formato de Rapier: pertenencia en los 16 bits altos, filtro en los bajos).
 * Los pisos por los que se sube (las rampas por la línea de paso de las escaleras y las losas de
 * las plantas de arriba) forman su propio grupo, que el controlador ignora mientras la altura sale
 * de una escalera: ni se apoya en ellos ni roza sus cantos (al bajar de un descanso, el de la losa
 * queda a la altura de la espalda).
 */
const FLOOR_BIT = 0x0002;
export const FLOOR_COLLISION_GROUPS = FLOOR_BIT * 0x10000 + 0xffff;
const IGNORE_FLOORS = 0xffff * 0x10000 + (0xffff & ~FLOOR_BIT);

/** Subconjunto del controlador cinemático de Rapier que usa el paso (facilita tests). */
export interface CharacterControllerLike<TCollider> {
  computeColliderMovement(
    collider: TCollider,
    desired: Vec3Like,
    filterFlags?: number,
    filterGroups?: number,
  ): void;
  computedMovement(): Vec3Like;
  computedGrounded(): boolean;
  enableSnapToGround(distance: number): void;
  disableSnapToGround(): void;
}

/** Hasta cuánto (m) se pega al piso al bajar (rampas, escalones). */
const SNAP_TO_GROUND = 0.3;

export interface PersonMotionState {
  verticalSpeed: number;
}

/** Sobre una escalera: dónde se apoya la persona (ver `stair-guide`). */
export interface StairFooting {
  /** Altura (m) de los pies apoyados sobre el perfil de la escalera. */
  readonly floor: number;
  /** Cuánto sube (m) ese apoyo por metro que se avance en la dirección del paso. */
  readonly rise: number;
}

/**
 * Sobre una escalera, lo más rápido (m/s) que la altura se acerca al apoyo: al entrar de costado
 * no salta de golpe.
 */
const STAIR_RATE = 3;

/**
 * Un paso de simulación de la persona: aplica la intención según el rumbo, la gravedad (o, sobre
 * una escalera, la altura de su línea de paso, sin rozar sus rampas), y deja que el controlador
 * resuelva colisiones (deslizarse por muros y barandas, subir escalones). Devuelve la posición
 * siguiente del centro de la cápsula.
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
  /** Dirección que reemplaza a la de las teclas (sobre una escalera, la asistida). */
  direction?: readonly [number, number],
  /** Sobre una escalera, su línea de paso: la altura sale de ella (y no de la gravedad). */
  stair?: StairFooting | null,
  /** Margen del controlador (m) sobre las superficies. */
  offset = 0.02,
): Vec3Like {
  const [dx, dz] = direction ?? horizontalDirection(intent, yaw);
  const speed = intent.run ? profile.runSpeed : profile.walkSpeed;
  let dy: number;
  let groups: number | undefined;
  if (stair) {
    // La altura sale de la escalera: ni sus rampas, ni las losas, ni pegarse al piso de abajo.
    groups = IGNORE_FLOORS;
    controller.disableSnapToGround();
    state.verticalSpeed = 0;
    const max = STAIR_RATE * dt;
    const feet = position.y - capsuleDimensions(profile).centerY;
    // El apoyo donde termina el paso, con el margen del controlador como sobre el piso: al salir
    // de la escalera empalma (el apoyo ya se calculó con ese margen alrededor de la persona).
    const ahead = stair.rise * Math.hypot(dx, dz) * speed * dt;
    dy = Math.min(max, Math.max(-max, stair.floor + ahead + offset - feet));
  } else {
    controller.enableSnapToGround(SNAP_TO_GROUND);
    state.verticalSpeed = Math.max(-MAX_FALL_SPEED, state.verticalSpeed - GRAVITY * dt);
    dy = state.verticalSpeed * dt;
  }
  const desired = { x: dx * speed * dt, y: dy, z: dz * speed * dt };
  controller.computeColliderMovement(collider, desired, undefined, groups);
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
  c.enableSnapToGround(SNAP_TO_GROUND);
  c.setSlideEnabled(true);
  c.setMaxSlopeClimbAngle(MAX_SLOPE_CLIMB);
  c.setMinSlopeSlideAngle(MAX_SLOPE_CLIMB);
}
