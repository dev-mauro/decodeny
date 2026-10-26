import { useThree } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import { Mesh, Raycaster, Vector2, type Object3D } from 'three';
import { CLICK_DRAG_TOLERANCE_PX } from './interaction';
import type { MeasurePoint } from './measure';

/**
 * Clics de la herramienta de medición: un raycast propio sobre la geometría del nivel (los
 * objetos detienen la propagación de sus clics, así que no se usan los eventos de R3F). Un
 * arrastre (orbitar) no marca punto.
 */
export function MeasureClicks({
  target,
  elevation,
  onPoint,
}: {
  readonly target: RefObject<Object3D | null>;
  readonly elevation: number;
  readonly onPoint: (point: MeasurePoint) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > CLICK_DRAG_TOLERANCE_PX || !target.current) return;
      const rect = el.getBoundingClientRect();
      const ndc = new Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster
        .intersectObject(target.current, true)
        .find((h) => h.object instanceof Mesh && h.object.visible && h.object.name !== 'measure');
      if (!hit) return;
      onPoint({
        x: Math.round(hit.point.x * 1000),
        y: Math.round(-hit.point.z * 1000),
        z: Math.round(hit.point.y * 1000 - elevation),
      });
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [camera, elevation, gl, onPoint, target]);
  return null;
}
