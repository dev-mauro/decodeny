/** ¿El sistema pide reducir el movimiento (`prefers-reduced-motion`)? */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
