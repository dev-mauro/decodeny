import { mmToMeters } from '@decodeny/domain';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { PlacementEvent, ViewerPlacement } from '../selection';
import { CLICK_DRAG_TOLERANCE_PX } from './interaction';

/**
 * Ubicación con el puntero en la vista 3D: proyecta el puntero sobre un plano horizontal a la
 * altura indicada y avisa cada movimiento y el clic. Arrastrar sigue orbitando la cámara.
 */
export function PlacementPointer({ placement }: { readonly placement: ViewerPlacement }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const latest = useRef(placement);
  useEffect(() => {
    latest.current = placement;
  });

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const hit = new Vector3();
    const plane = new Plane(new Vector3(0, 1, 0), 0);
    let down: { x: number; y: number } | null = null;

    const emit = (phase: PlacementEvent['phase'], ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      plane.constant = -mmToMeters(latest.current.height);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      latest.current.onEvent({
        phase,
        point: { x: hit.x * 1000, y: -hit.z * 1000 },
        snap: !ev.altKey,
      });
    };
    // Con un botón apretado se está orbitando: el objeto no sigue al puntero.
    const onMove = (ev: PointerEvent) => {
      if (ev.buttons === 0) emit('move', ev);
    };
    const onDown = (ev: PointerEvent) => {
      down = ev.button === 0 ? { x: ev.clientX, y: ev.clientY } : null;
    };
    const onUp = (ev: PointerEvent) => {
      const click =
        down !== null &&
        ev.button === 0 &&
        Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < CLICK_DRAG_TOLERANCE_PX;
      down = null;
      if (!click) {
        emit('move', ev);
        return;
      }
      // El `click` que sigue a este pointerup es parte de la ubicación: no debe llegar a la
      // escena (que ya vuelve a seleccionar) y elegir lo que haya detrás.
      const swallow = (e: MouseEvent) => {
        e.stopPropagation();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => {
        window.removeEventListener('click', swallow, { capture: true });
      }, 500);
      emit('end', ev);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl]);

  return null;
}
