import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
});

test('agrega una luminaria de cielo, la apaga y cambia a vista de noche', async ({ page }) => {
  await page.getByRole('button', { name: /Dormitorio 2/ }).click();
  await page.getByTestId('tab-catalog').click();
  await page.getByTestId('catalog-search').fill('colgante');
  await page.getByTestId('catalog-light.pendant@1').click();
  // Queda en el lugar sugerido (Enter); también se puede ubicar con el puntero.
  await page.keyboard.press('Enter');

  const inspector = page.getByTestId('item-inspector');
  await expect(page.getByTestId('inspector-title')).toHaveText('Lámpara colgante');
  await expect(inspector).toContainText('Cuelga del cielo');
  await expect(page.getByTestId('param-on')).toBeChecked();
  await page.getByTestId('param-on').uncheck();
  await expect(page.getByTestId('param-on')).not.toBeChecked();

  await page.getByTestId('toggle-lighting').click();
  await expect(page.getByTestId('toggle-lighting')).toHaveAttribute('aria-pressed', 'true');
});

test('un espejo de muro queda apoyado y su altura se edita', async ({ page }) => {
  await page.getByRole('button', { name: /Baño/ }).click();
  await page.getByTestId('tab-catalog').click();
  await page.getByTestId('catalog-decor.mirror@1').click();
  // Queda en el lugar sugerido (Enter); también se puede ubicar con el puntero.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inspector-title')).toHaveText('Espejo');
  await expect(page.getByTestId('item-elevation')).toHaveValue('1,00');
  await page.getByTestId('item-elevation').fill('1,2');
  await page.getByTestId('item-elevation').press('Enter');
  await expect(page.getByTestId('item-elevation')).toHaveValue('1,20');
  // Apoyado en un muro: girado para mirar al recinto.
  await expect(page.getByTestId('item-rotation')).not.toHaveValue('0');
});
