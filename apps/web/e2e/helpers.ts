import { expect, type Page } from '@playwright/test';

/**
 * Espera a que la vista 3D (que se carga bajo demanda) haya dibujado su escena: antes, un clic
 * sobre el lienzo no llega a ningún objeto.
 */
export async function waitForScene(page: Page): Promise<void> {
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-ready', 'true');
}
