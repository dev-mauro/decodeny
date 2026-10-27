import { CameraControls } from '@react-three/drei';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  type ComponentRef,
  type Ref,
  type RefObject,
} from 'react';
import { Box3, Sphere, Vector3 } from 'three';
import { prefersReducedMotion } from './motion';

/** API imperativa de cámara expuesta a la UI (botones "Encuadrar", "Vista superior"). */
export interface ViewerCameraApi {
  fitToContent(animate?: boolean): void;
  viewFromTop(animate?: boolean): void;
}

interface EditCameraProps {
  readonly bounds: Box3 | null;
  readonly apiRef?: Ref<ViewerCameraApi> | undefined;
  /** Compartido con el visor: sobrevive al desmontaje al cambiar de modo de navegación. */
  readonly autoFitted: RefObject<boolean>;
}

/** Distancia del objetivo de órbita frente a la cámara al volver de un recorrido (m). */
const RESUME_TARGET_DISTANCE = 4;

const EMPTY_BOUNDS = new Box3(new Vector3(-3, 0, -3), new Vector3(3, 2.4, 3));
/** Vista "tres cuartos" inicial: azimut y ángulo polar en radianes. */
const DEFAULT_AZIMUTH = Math.PI / 5;
const DEFAULT_POLAR = Math.PI / 3.6;

/** Preferencia de accesibilidad: sin transiciones animadas de cámara. */

/** Cámara orbital del modo edición (rotar, desplazar, acercar). */
export function EditCamera({ bounds, apiRef, autoFitted }: EditCameraProps) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const reducedMotion = prefersReducedMotion();

  /** Encuadra todo el contenido; conserva el ángulo actual salvo que se pida restablecerlo. */
  const fit = (animate: boolean, resetAngle = false) => {
    const c = controls.current;
    if (!c) return;
    if (resetAngle) void c.rotateTo(DEFAULT_AZIMUTH, DEFAULT_POLAR, animate);
    void c.fitToSphere((bounds ?? EMPTY_BOUNDS).getBoundingSphere(new Sphere()), animate);
  };

  useImperativeHandle(apiRef, () => ({
    fitToContent: (animate = true) => fit(animate && !reducedMotion),
    viewFromTop: (requested = true) => {
      const animate = requested && !reducedMotion;
      const box = bounds ?? EMPTY_BOUNDS;
      const center = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      const height = Math.max(size.x, size.z) * 1.4 + 2;
      // Un mínimo desplazamiento en Z evita la singularidad de mirar exactamente hacia abajo.
      void controls.current?.setLookAt(
        center.x,
        height,
        center.z + 0.001,
        center.x,
        0,
        center.z,
        animate,
      );
    },
  }));

  // Al volver de un recorrido, orbita alrededor de un punto frente a la cámara (sin saltos).
  useEffect(() => {
    const c = controls.current;
    if (!c || !autoFitted.current) return;
    const camera = c.camera;
    const target = camera.getWorldDirection(new Vector3()).multiplyScalar(RESUME_TARGET_DISTANCE);
    target.add(camera.position);
    const { x, y, z } = camera.position;
    void c.setLookAt(x, y, z, target.x, target.y, target.z, false);
  }, [autoFitted]);

  // Encuadra automáticamente cuando aparece contenido por primera vez (o tras vaciarse).
  useEffect(() => {
    const has = bounds !== null;
    if (has && !autoFitted.current) fit(false, true);
    autoFitted.current = has;
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={0.5}
      maxDistance={300}
      maxPolarAngle={Math.PI / 2 - 0.02}
      dollyToCursor
      {...(reducedMotion ? { smoothTime: 0, draggingSmoothTime: 0 } : {})}
    />
  );
}
