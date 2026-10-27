import { useSyncExternalStore } from 'react';

/** ¿Se cumple la media query? Se actualiza al cambiar (rotar la pantalla, conectar un mouse). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Pantalla táctil como puntero principal (teléfono, tablet). */
export const useCoarsePointer = (): boolean => useMediaQuery('(pointer: coarse)');

/** Layout de escritorio (tres columnas) desde `lg` (1024 px). */
export const useDesktopLayout = (): boolean => useMediaQuery('(min-width: 1024px)');
