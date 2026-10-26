import { expect, test } from '@playwright/test';

test('la aplicación abre sin conexión una vez instalada', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Comienza con las medidas' })).toBeVisible();
  // Espera a que el service worker termine de precargar y controle la página.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Comienza con las medidas' })).toBeVisible();
  // Sin red también se puede seguir trabajando: cargar el ejemplo, editar.
  await page.getByTestId('load-sample').click();
  await expect(page.getByTestId('rooms-list')).toContainText('Living');
  await context.setOffline(false);
});
