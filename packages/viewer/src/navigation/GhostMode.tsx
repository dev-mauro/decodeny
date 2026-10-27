import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import type { NavigationModeProps } from './types';
import { usePointerLook } from './use-pointer-look';
import { useMovementIntent } from './virtual-input';

export const GHOST_BASE_SPEED = 3;
const RUN_MULTIPLIER = 3;
const MIN_FACTOR = 0.25;
const MAX_FACTOR = 8;

const forward = new Vector3();
const right = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Vuelo libre ("fantasma"): sin gravedad ni colisiones, atraviesa muros. Avanza en la
 * dirección de la mirada; Espacio/E sube y C/Q baja; la rueda ajusta la velocidad.
 */
export function GhostMode({ onPointerLockChange, virtualInput }: NavigationModeProps) {
  const camera = useThree((s) => s.camera);
  const element = useThree((s) => s.gl.domElement);
  usePointerLook(onPointerLockChange, undefined, virtualInput);
  const readIntent = useMovementIntent(virtualInput);
  const speedFactor = useRef(1);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = speedFactor.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
      speedFactor.current = Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, next));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [element]);

  useFrame((_, delta) => {
    const intent = readIntent();
    if (intent.forward === 0 && intent.right === 0 && intent.up === 0) return;
    const dt = Math.min(delta, 0.1);
    const speed = GHOST_BASE_SPEED * speedFactor.current * (intent.run ? RUN_MULTIPLIER : 1);
    camera.getWorldDirection(forward);
    right.crossVectors(forward, UP).normalize();
    camera.position
      .addScaledVector(forward, intent.forward * speed * dt)
      .addScaledVector(right, intent.right * speed * dt)
      .addScaledVector(UP, intent.up * speed * dt);
  });

  return null;
}
