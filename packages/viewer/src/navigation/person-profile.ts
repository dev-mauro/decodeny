import { mmToMeters } from '@decodeny/domain';

/**
 * Perfil físico de la persona del modo recorrido. Configurable para futuros perfiles
 * (niño, silla de ruedas…) sin tocar el controlador.
 */
export interface PersonProfile {
  /** Estatura total (mm). */
  readonly heightMm: number;
  /** Distancia de los ojos a la coronilla (mm). */
  readonly eyeBelowTopMm: number;
  /** Radio de la cápsula de colisión (mm). */
  readonly radiusMm: number;
  /** Velocidad al caminar (m/s). */
  readonly walkSpeed: number;
  /** Velocidad al trotar (m/s). */
  readonly runSpeed: number;
  /** Altura máxima de escalón que puede subir sin saltar (mm). */
  readonly maxStepMm: number;
}

export const DEFAULT_PERSON: PersonProfile = {
  heightMm: 1700,
  eyeBelowTopMm: 100,
  radiusMm: 250,
  walkSpeed: 1.4,
  runSpeed: 3,
  maxStepMm: 200,
};

export interface CapsuleDimensions {
  readonly radius: number;
  /** Semialtura del tramo cilíndrico (convención de Rapier). */
  readonly halfHeight: number;
  /** Altura del centro de la cápsula sobre los pies. */
  readonly centerY: number;
  /** Altura de los ojos sobre el centro de la cápsula. */
  readonly eyeOffset: number;
}

/** Dimensiones de la cápsula en metros a partir del perfil. */
export function capsuleDimensions(profile: PersonProfile): CapsuleDimensions {
  const height = mmToMeters(profile.heightMm);
  const radius = Math.min(mmToMeters(profile.radiusMm), height / 2);
  const centerY = height / 2;
  return {
    radius,
    halfHeight: Math.max(0, centerY - radius),
    centerY,
    eyeOffset: height - mmToMeters(profile.eyeBelowTopMm) - centerY,
  };
}
