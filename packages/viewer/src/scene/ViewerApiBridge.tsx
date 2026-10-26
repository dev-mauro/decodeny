import { useThree } from '@react-three/fiber';
import { useImperativeHandle, type Ref } from 'react';

/** API imperativa del visor para la UI (independiente del modo de navegación). */
export interface ViewerApi {
  /**
   * Imagen PNG de lo que se ve ahora (sin la interfaz). `scale` multiplica la resolución del
   * lienzo (p. ej. 2 para una captura nítida al imprimir).
   */
  captureImage(scale?: number): Promise<Blob | null>;
}

/** Expone `ViewerApi` desde dentro del `<Canvas>` (necesita el renderer, la escena y la cámara). */
export function ViewerApiBridge({ apiRef }: { readonly apiRef: Ref<ViewerApi> | undefined }) {
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
  }));
  return null;
}
