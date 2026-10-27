/**
 * Otros participantes de una sesión colaborativa, vistos por el visor. El visor no sabe nada de
 * la red: la aplicación le da la lista y una función para leer la pose más reciente de cada uno
 * (que cambia muchas veces por segundo, sin pasar por React).
 */
export interface ViewerPeer {
  readonly id: string;
  readonly name: string;
  /** Color del cuerpo y de la etiqueta (CSS). */
  readonly color: string;
}

/** Pose de la cámara de alguien (metros, coordenadas de Three; ángulos en radianes). */
export interface ViewerCameraPose {
  readonly position: readonly [number, number, number];
  /** Giro horizontal (0: mirando hacia −Z, el norte de la planta). */
  readonly yaw: number;
  /** Inclinación (positiva: mirando hacia arriba). */
  readonly pitch: number;
}

export interface ViewerPeerPose extends ViewerCameraPose {
  /** De pie sobre el piso (recorrido) o flotando (edición, vuelo). */
  readonly standing: boolean;
}

export interface ViewerPeers {
  readonly list: readonly ViewerPeer[];
  readonly pose: (id: string) => ViewerPeerPose | undefined;
  /** Avisa cuando llega una pose nueva (el visor redibuja aunque esté en reposo). */
  readonly subscribe: (listener: () => void) => () => void;
}

/** Ángulo equivalente a `angle` más cercano a `reference` (para interpolar sin dar la vuelta larga). */
export function nearestAngle(reference: number, angle: number): number {
  const turn = Math.PI * 2;
  return reference + ((((angle - reference) % turn) + turn * 1.5) % turn) - Math.PI;
}

/**
 * Acerca una pose a otra de forma suave e independiente de los cuadros por segundo: las poses
 * llegan ~12 veces por segundo y el cuerpo se mueve fluido entre ellas.
 */
export function approachPose(
  current: ViewerCameraPose,
  target: ViewerCameraPose,
  dt: number,
  rate = 12,
): ViewerCameraPose {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    position: [
      mix(current.position[0], target.position[0]),
      mix(current.position[1], target.position[1]),
      mix(current.position[2], target.position[2]),
    ],
    yaw: mix(current.yaw, nearestAngle(current.yaw, target.yaw)),
    pitch: mix(current.pitch, target.pitch),
  };
}

/** Si dos poses son casi iguales (no hace falta seguir redibujando ni enviar otra). */
export function samePose(a: ViewerCameraPose, b: ViewerCameraPose, epsilon = 0.002): boolean {
  return (
    Math.abs(a.position[0] - b.position[0]) < epsilon &&
    Math.abs(a.position[1] - b.position[1]) < epsilon &&
    Math.abs(a.position[2] - b.position[2]) < epsilon &&
    Math.abs(nearestAngle(a.yaw, b.yaw) - a.yaw) < epsilon &&
    Math.abs(a.pitch - b.pitch) < epsilon
  );
}
