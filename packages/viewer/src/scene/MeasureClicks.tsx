import type { Vec2 } from '@decodeny/domain';
import { useThree } from '@react-three/fiber';
import { useEffect, useState, type RefObject } from 'react';
import { Mesh, PerspectiveCamera, Raycaster, Vector2, type Object3D } from 'three';
import { snapMeasurePoint, type MeasureSnapKind } from '../plan/measure-snap';
import { CLICK_DRAG_TOLERANCE_PX } from './interaction';
import type { MeasurePoint } from './measure';

/** Distancia (px en pantalla) a la que el punto se pega a una esquina o a un borde: poca. */
const SNAP_PX = 10;

interface MeasureHover {
  readonly point: MeasurePoint;
  readonly kind: MeasureSnapKind;
}

/**
 * Clics de la herramienta de medición: un raycast propio sobre la geometría del nivel (los
 * objetos detienen la propagación de sus clics, así que no se usan los eventos de R3F). Un
 * arrastre (orbitar) no marca punto. Como en la planta, el punto se pega a las esquinas y caras
 * interiores de los espacios y a los bordes de los muebles (`outlines`) solo de cerca; un punto
 * bajo el puntero muestra dónde quedaría. Alt mide libre.
 */
export function MeasureClicks({
  target,
  elevation,
  outlines,
  onPoint,
}: {
  readonly target: RefObject<Object3D | null>;
  readonly elevation: number;
  readonly outlines: readonly (readonly Vec2[])[];
  readonly onPoint: (point: MeasurePoint) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const [hover, setHover] = useState<MeasureHover | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new Raycaster();
    let down: { x: number; y: number } | null = null;
    let frame = 0;

    /** Punto medido bajo el puntero (mm, respecto del nivel), ya ajustado. */
    const pick = (e: PointerEvent | MouseEvent): MeasureHover | null => {
      if (!target.current) return null;
      const rect = el.getBoundingClientRect();
      const ndc = new Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster
        .intersectObject(target.current, true)
        .find((h) => h.object instanceof Mesh && h.object.visible && h.object.name !== 'measure');
      if (!hit) return null;
      const raw = { x: hit.point.x * 1000, y: -hit.point.z * 1000 };
      // Cuántos mm ocupa un píxel a la distancia del punto.
      const fov = camera instanceof PerspectiveCamera ? camera.fov : 45;
      const mmPerPx = (2 * hit.distance * Math.tan((fov * Math.PI) / 360) * 1000) / rect.height;
      const snap = snapMeasurePoint(outlines, raw, null, SNAP_PX * mmPerPx, e.altKey);
      return {
        point: {
          x: Math.round(snap.point.x),
          y: Math.round(snap.point.y),
          z: Math.round(hit.point.y * 1000 - elevation),
        },
        kind: snap.kind,
      };
    };

    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > CLICK_DRAG_TOLERANCE_PX) return;
      const picked = pick(e);
      if (picked) onPoint(picked.point);
    };
    const onMove = (e: PointerEvent) => {
      if (down || e.pointerType === 'touch') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHover(pick(e)));
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      setHover(null);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [camera, elevation, gl, onPoint, outlines, target]);

  if (!hover) return null;
  return (
    <mesh
      name="measure"
      position={[hover.point.x / 1000, hover.point.z / 1000, -hover.point.y / 1000]}
      renderOrder={10}
    >
      <sphereGeometry args={[hover.kind === 'free' ? 0.025 : 0.04, 16, 12]} />
      <meshBasicMaterial
        color={hover.kind === 'corner' ? '#16a34a' : hover.kind === 'edge' ? '#d97706' : '#db2777'}
        depthTest={false}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}
