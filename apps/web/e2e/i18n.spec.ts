import { expect, test } from '@playwright/test';

test('cambia la interfaz a inglés (cotas y catálogo incluidos) y lo recuerda', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.getByTestId('language').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Rooms' })).toBeVisible();
  await page.getByRole('button', { name: /Cocina/ }).click();
  // Medidas con punto decimal en inglés.
  await expect(page.getByTestId('room-side-1')).toHaveValue('2.40');
  await page.getByTestId('tab-catalog').click();
  await expect(page.getByTestId('catalog-list')).toContainText('Wardrobe');

  await page.reload();
  await expect(page.getByTestId('language')).toHaveValue('en');
  await page.getByTestId('language').selectOption('es');
  await expect(page.getByRole('heading', { name: 'Recintos' })).toBeVisible();
});
