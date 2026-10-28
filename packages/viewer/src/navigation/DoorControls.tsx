import { levelWallFootprints, type Level, type Opening } from '@decodeny/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { Vector3 } from 'three';
import { requestShadowUpdate } from '../scene/shadow-updates';
import { canClose, nearestDoor, type DoorStore } from './doors';

/** Puerta al alcance: su id y si está abierta (para la indicación de la interfaz). */
export interface NearbyDoor {
  readonly id: string;
  readonly open: boolean;
}

interface DoorControlsProps {
  readonly level: Level;
  readonly store: DoorStore;
  /** Teclas que abren o cierran la puerta al alcance (`KeyboardEvent.code`). */
  readonly keys: readonly string[];
  /** Radio de la persona (mm): no se cierra una puerta con alguien en el vano. */
  readonly radiusMm: number;
  readonly onNearbyDoor?: ((door: NearbyDoor | null) => void) | undefined;
  /** Para abrir o cerrar desde fuera (botón táctil, clic con el puntero capturado). */
  readonly toggleRef: RefObject<(() => boolean) | null>;
}

const forward = new Vector3();

/** Anima las puertas, encuentra la que está al alcance y la abre o cierra con las teclas. */
export function DoorControls({
  level,
  store,
  keys,
  radiusMm,
  onNearbyDoor,
  toggleRef,
}: DoorControlsProps) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const canvas = gl.domElement;
  const footprints = useMemo(() => levelWallFootprints(level), [level]);
  const nearby = useRef<Opening | null>(null);
  const reported = useRef<string>('');
  const sinceCheck = useRef(Infinity);

  const toggle = useCallback((): boolean => {
    const door = nearby.current;
    if (!door) return false;
    const state = store.get(door);
    if (state.target === 1) {
      const fp = footprints.get(door.wallId);
      const eye = { x: camera.position.x * 1000, y: -camera.position.z * 1000 };
      if (fp && !canClose(door, fp, eye, radiusMm)) return false;
    }
    store.toggle(door);
    invalidate();
    return true;
  }, [camera, footprints, invalidate, radiusMm, store]);

  useEffect(() => {
    toggleRef.current = toggle;
    return () => {
      toggleRef.current = null;
    };
  }, [toggle, toggleRef]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || !keys.includes(e.code)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keys, toggle]);

  // Con el puntero capturado, un clic usa la puerta al alcance.
  useEffect(() => {
    const onPointerDown = () => {
      if (document.pointerLockElement === canvas) toggle();
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, [canvas, toggle]);

  useEffect(
    () => () => {
      onNearbyDoor?.(null);
    },
    [onNearbyDoor],
  );

  useFrame((_, dt) => {
    // Una hoja que se mueve cambia las sombras (que son estáticas: ver `StaticShadows`).
    if (store.step(Math.min(dt, 0.1))) {
      requestShadowUpdate(gl);
      invalidate();
    }
    // La puerta al alcance se recalcula unas 8 veces por segundo.
    sinceCheck.current += dt;
    if (sinceCheck.current < 0.12) return;
    sinceCheck.current = 0;
    camera.getWorldDirection(forward);
    const flat = Math.hypot(forward.x, forward.z) || 1;
    const door = nearestDoor(
      level,
      footprints,
      { x: camera.position.x * 1000, y: -camera.position.z * 1000 },
      { x: forward.x / flat, y: -forward.z / flat },
    );
    nearby.current = door;
    const report = door ? `${door.id}:${String(store.get(door).target)}` : '';
    if (report === reported.current) return;
    reported.current = report;
    onNearbyDoor?.(door ? { id: door.id, open: store.get(door).target === 1 } : null);
  });

  return null;
}
