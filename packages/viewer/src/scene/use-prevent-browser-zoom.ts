import { useEffect, type RefObject } from 'react';

/**
 * Evita que pellizcar sobre una vista haga zoom de la página entera: el gesto es de la vista
 * (zoom del plano, cámara 3D). `touch-action: none` lo cubre en la mayoría de los navegadores;
 * Safari en iOS además necesita cancelar `touchmove` con varios dedos y sus eventos `gesture*`.
 * El resto de la página conserva el zoom del navegador (accesibilidad).
 */
export function usePreventBrowserZoom(ref: RefObject<Element | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTouchMove = (e: Event) => {
      if ((e as TouchEvent).touches.length > 1) e.preventDefault();
    };
    const cancel = (e: Event) => {
      e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('gesturestart', cancel);
    el.addEventListener('gesturechange', cancel);
    return () => {
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('gesturestart', cancel);
      el.removeEventListener('gesturechange', cancel);
    };
  }, [ref]);
}
