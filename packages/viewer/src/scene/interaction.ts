/** Desplazamiento máximo (px) entre pointerdown y pointerup para considerar un clic, no un arrastre. */
export const CLICK_DRAG_TOLERANCE_PX = 4;

/** ¿El clic suma a la selección? (Shift, Ctrl o Cmd). */
export const isAdditiveClick = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
  e.shiftKey || e.ctrlKey || e.metaKey;
