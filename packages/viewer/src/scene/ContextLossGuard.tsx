import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

/**
 * El navegador puede descartar el contexto WebGL (poca memoria, driver reiniciado). Se pide
 * restaurarlo (`preventDefault`) y, al volver, Three vuelve a subir geometrías y texturas.
 */
export function ContextLossGuard({
  onRestored,
}: {
  readonly onRestored?: (() => void) | undefined;
}) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (e: Event) => e.preventDefault();
    const restored = () => {
      invalidate();
      onRestored?.();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl, invalidate, onRestored]);
  return null;
}
