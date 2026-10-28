import { expect, type Page } from '@playwright/test';

/**
 * Espera a que la vista 3D (que se carga bajo demanda) haya dibujado su escena: antes, un clic
 * sobre el lienzo no llega a ningún objeto. El primer cuadro, con WebGL por software (SwiftShader)
 * en un runner de CI de 2 núcleos, puede tardar más que la espera normal de 10 s.
 */
export async function waitForScene(page: Page): Promise<void> {
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
}
