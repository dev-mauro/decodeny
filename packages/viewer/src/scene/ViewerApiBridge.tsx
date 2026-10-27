import { useThree } from '@react-three/fiber';
import { useImperativeHandle, type Ref, type RefObject } from 'react';

/** API imperativa del visor para la UI (independiente del modo de navegación). */
export interface ViewerApi {
  /**
   * Imagen PNG de lo que se ve ahora (sin la interfaz). `scale` multiplica la resolución del
   * lienzo (p. ej. 2 para una captura nítida al imprimir).
   */
  captureImage(scale?: number): Promise<Blob | null>;
  /** Costo de dibujar la vista actual (solo vistas WebGL): para medir presupuestos de rendimiento. */
  renderStats?(): RenderStats;
  /**
   * Plano, dibujando muros: agrega un tramo de `lengthMm` en `direction` desde el punto actual.
   * Devuelve `false` si no hay un tramo en curso.
   */
  drawSegment?(direction: { readonly x: number; readonly y: number }, lengthMm: number): boolean;
  /** Recorrido o vuelo: abre o cierra la puerta al alcance. Devuelve si había una. */
  toggleDoor?(): boolean;
}

export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
}

/** Expone `ViewerApi` desde dentro del `<Canvas>` (necesita el renderer, la escena y la cámara). */
export function ViewerApiBridge({
  apiRef,
  toggleDoorRef,
}: {
  readonly apiRef: Ref<ViewerApi> | undefined;
  readonly toggleDoorRef?: RefObject<(() => boolean) | null>;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useImperativeHandle(apiRef, () => ({
    captureImage: (scale = 1) =>
      new Promise<Blob | null>((resolve) => {
        const previous = gl.getPixelRatio();
        if (scale !== 1) gl.setPixelRatio(previous * scale);
        // Se renderiza y se lee en el mismo paso: el buffer de WebGL aún no se descartó.
        gl.render(scene, camera);
        const url = gl.domElement.toDataURL('image/png');
        if (scale !== 1) {
          gl.setPixelRatio(previous);
          gl.render(scene, camera);
        }
        fetch(url)
          .then((r) => r.blob())
          .then(resolve, () => resolve(null));
      }),
    toggleDoor: () => toggleDoorRef?.current?.() ?? false,
    renderStats: () => {
      gl.render(scene, camera);
      const { render, memory } = gl.info;
      return {
        drawCalls: render.calls,
        triangles: render.triangles,
        geometries: memory.geometries,
        textures: memory.textures,
      };
    },
  }));
  return null;
}
