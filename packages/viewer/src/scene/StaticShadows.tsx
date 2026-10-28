import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { requestShadowUpdate } from './shadow-updates';

const sameKeys = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Sombras estáticas: los mapas de sombra (el del sol y los cúbicos de las luminarias, de 6 caras
 * cada uno) no se redibujan en cada cuadro sino cuando algo cambia (`keys`: el documento, la luz,
 * el modo…) o lo pide `requestShadowUpdate` (una puerta que se mueve). La cámara no afecta a las
 * sombras, así que recorrer la casa no las vuelve a calcular.
 */
export function StaticShadows({ keys }: { readonly keys: readonly unknown[] }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const previous = useRef<readonly unknown[] | null>(null);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    requestShadowUpdate(gl);
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  // Tras cada render: si cambió alguna clave, sombras nuevas en el próximo cuadro.
  useEffect(() => {
    if (previous.current && sameKeys(previous.current, keys)) return;
    previous.current = keys;
    requestShadowUpdate(gl);
    invalidate();
  });
  return null;
}
