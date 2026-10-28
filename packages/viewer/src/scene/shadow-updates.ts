import type { WebGLRenderer } from 'three';

/**
 * Pide redibujar los mapas de sombra en el próximo cuadro. Son estáticos (ver `StaticShadows`):
 * lo pide quien cambia algo que proyecta sombra (una puerta moviéndose, otras luces encendidas).
 */
export function requestShadowUpdate(gl: WebGLRenderer): void {
  gl.shadowMap.needsUpdate = true;
}
