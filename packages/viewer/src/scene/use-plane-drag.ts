import { sub, type Vec2 } from '@decodeny/domain';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Raycaster, Vector2, Vector3, type Plane } from 'three';
import { CLICK_DRAG_TOLERANCE_PX } from './interaction';

const toPlan = (p: Vector3): Vec2 => ({ x: p.x * 1000, y: -p.z * 1000 });

export interface PlaneDragHandlers {
  /** Plano (mundo) sobre el que se proyecta el puntero. */
  readonly plane: Plane;
  /** Desplazamiento acumulado en planta (mm) desde el inicio del arrastre. */
  readonly onMove: (delta: Vec2, event: PointerEvent) => void;
  readonly onFinish: (phase: 'end' | 'cancel', delta: Vec2, snap: boolean) => void;
}

/**
 * Arrastre de una entidad proyectando el puntero sobre un plano. Mientras dura, la cámara
 * orbital se desactiva; un clic sin movimiento sigue siendo un clic. Esc cancela.
 */
export function usePlaneDrag() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const [dragging, setDragging] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const begin = useCallback(
    (key: string, e: ThreeEvent<PointerEvent>, handlers: PlaneDragHandlers) => {
      if (e.button !== 0) return;
      const hit = e.ray.intersectPlane(handlers.plane, new Vector3());
      if (!hit) return;
      e.stopPropagation();
      cleanupRef.current?.();

      const start = toPlan(hit);
      const origin = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      const raycaster = new Raycaster();
      const ndc = new Vector2();
      const point = new Vector3();
      let moved = false;
      let last: Vec2 = { x: 0, y: 0 };
      let snap = true;
      if (controls) controls.enabled = false;

      const planAt = (ev: PointerEvent): Vec2 | null => {
        const rect = gl.domElement.getBoundingClientRect();
        ndc.set(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        return raycaster.ray.intersectPlane(handlers.plane, point) ? toPlan(point) : null;
      };
      const onMove = (ev: PointerEvent) => {
        if (!moved) {
          if (Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < CLICK_DRAG_TOLERANCE_PX)
            return;
          moved = true;
          setDragging(key);
        }
        const p = planAt(ev);
        if (!p) return;
        last = sub(p, start);
        snap = !ev.altKey;
        handlers.onMove(last, ev);
      };
      const finish = (phase: 'end' | 'cancel') => {
        cleanup();
        if (moved) handlers.onFinish(phase, last, snap);
      };
      const onUp = () => finish('end');
      const onCancel = () => finish('cancel');
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape') return;
        ev.stopPropagation();
        finish('cancel');
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        if (controls) controls.enabled = true;
        cleanupRef.current = null;
        setDragging(null);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
      cleanupRef.current = cleanup;
    },
    [camera, controls, gl],
  );

  return { begin, dragging };
}
