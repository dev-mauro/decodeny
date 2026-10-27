import { expect, test, type Page } from '@playwright/test';

async function setLength(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId);
  await input.fill(value);
  await input.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
});

test('agrega un mueble desde el catálogo al recinto seleccionado y lo edita', async ({ page }) => {
  await page.getByRole('button', { name: /Dormitorio 2/ }).click();
  await page.getByTestId('tab-catalog').click();
  await expect(page.getByTestId('catalog-target')).toContainText('Dormitorio 2');

  // La búsqueda ignora acentos.
  await page.getByTestId('catalog-search').fill('comoda');
  await expect(page.getByTestId('catalog-list')).toContainText('Cómoda');
  // Miniatura generada desde la definición del mueble.
  await expect(page.getByTestId('catalog-thumb-storage.dresser@1')).toBeVisible();
  await page.getByTestId('catalog-storage.dresser@1').click();
  // Queda en el lugar sugerido (Enter); también se puede ubicar con el puntero.
  await page.keyboard.press('Enter');

  const inspector = page.getByTestId('item-inspector');
  await expect(inspector).toBeVisible();
  await expect(page.getByTestId('inspector-title')).toHaveText('Cómoda');
  await expect(inspector).toContainText('Dormitorio 2');

  // Medidas libres: también muy chicas.
  await setLength(page, 'param-width', '0,25');
  await expect(page.getByTestId('param-width')).toHaveValue('0,25');
  await expect(page.getByTestId('param-width')).not.toHaveAttribute('aria-invalid', 'true');
  await setLength(page, 'param-height', '3');
  await expect(page.getByTestId('param-height')).toHaveValue('3,00');

  // Girar con R (fuera de los campos de texto) y con el campo.
  await page.getByTestId('inspector-title').click();
  await page.keyboard.press('r');
  await expect(page.getByTestId('item-rotation')).toHaveValue('90');
  await page.getByTestId('item-rotation').fill('45');
  await page.getByTestId('item-rotation').press('Enter');
  await expect(page.getByTestId('item-rotation')).toHaveValue('45');
});

test('aplica medidas típicas y avisa superposiciones al duplicar', async ({ page }) => {
  await page.getByTestId('tab-catalog').click();
  await page.getByTestId('catalog-furniture.bed@1').click();
  // Queda en el lugar sugerido (Enter); también se puede ubicar con el puntero.
  await page.keyboard.press('Enter');
  await page.getByTestId('item-presets').getByRole('button', { name: /King/ }).click();
  await expect(page.getByTestId('param-width')).toHaveValue('1,80');
  await expect(page.getByTestId('param-depth')).toHaveValue('2,00');

  // La copia queda a 30 cm: se superpone con el original.
  await page.keyboard.press('Control+d');
  await expect(page.getByTestId('item-warning')).toBeVisible();

  await page.keyboard.press('Delete');
  await expect(page.getByTestId('item-inspector')).toBeHidden();
});

test('los muebles del recinto aparecen en su inspector', async ({ page }) => {
  await page.getByRole('button', { name: /Baño/ }).click();
  const list = page.getByTestId('room-furniture');
  await expect(list).toContainText('Inodoro');
  await expect(list).toContainText('Ducha');
  await list.getByRole('button', { name: /Inodoro/ }).click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Inodoro');
});
