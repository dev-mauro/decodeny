import { useThree } from '@react-three/fiber';
import { useEffect, useRef, type RefObject } from 'react';
import { Euler } from 'three';

export const LOOK_SENSITIVITY = 0.0022;
const MAX_PITCH = (85 * Math.PI) / 180;

export interface LookState {
  yaw: number;
  pitch: number;
}

/**
 * Mirada en primera persona con Pointer Lock: un clic sobre la vista captura el mouse y su
 * movimiento rota la cámara (yaw/pitch, sin roll). Informa cuándo se captura o libera.
 */
export function usePointerLook(
  onLockChange?: (locked: boolean) => void,
  sensitivity = LOOK_SENSITIVITY,
): RefObject<LookState> {
  const camera = useThree((s) => s.camera);
  const element = useThree((s) => s.gl.domElement);
  const look = useRef<LookState>({ yaw: 0, pitch: 0 });
  const lockChange = useRef(onLockChange);
  useEffect(() => {
    lockChange.current = onLockChange;
  }, [onLockChange]);

  useEffect(() => {
    // Continúa desde la orientación actual de la cámara (transición sin saltos).
    const euler = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    look.current = { yaw: euler.y, pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, euler.x)) };
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ');

    const locked = () => document.pointerLockElement === element;
    const onClick = () => {
      if (!locked()) void element.requestPointerLock();
    };
    const onMove = (e: MouseEvent) => {
      if (!locked()) return;
      const state = look.current;
      state.yaw -= e.movementX * sensitivity;
      state.pitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, state.pitch - e.movementY * sensitivity),
      );
      camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
    };
    const onChange = () => lockChange.current?.(locked());

    element.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('pointerlockchange', onChange);
    return () => {
      element.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('pointerlockchange', onChange);
      if (locked()) document.exitPointerLock();
      lockChange.current?.(false);
    };
  }, [camera, element, sensitivity]);

  return look;
}
