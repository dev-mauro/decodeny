import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await expect(page.getByRole('button', { name: /Cocina/ })).toBeVisible();
});

test('agregar una planta con el contorno de la de abajo y moverse entre plantas', async ({
  page,
}) => {
  const select = page.getByTestId('level-select');
  await expect(select.locator('option')).toHaveCount(1);
  await page.getByTestId('level-add').click();
  await page.getByTestId('level-add-outline').click();

  // La nueva queda activa, arriba en la lista, con los mismos espacios.
  await expect(select.locator('option')).toHaveCount(2);
  await expect(select.locator('option').first()).toHaveText('Piso 2');
  await expect(select.locator('option:checked')).toHaveText('Piso 2');
  await expect(page.getByRole('button', { name: /Cocina/ })).toBeVisible();

  // En el plano se ve, tenue, la planta de abajo.
  await page.getByTestId('view-plan').click();
  await expect(page.getByTestId('plan-underlay')).toBeAttached();

  // Av Pág / Re Pág bajan y suben de planta; la de abajo no tiene nada debajo.
  await page.keyboard.press('PageDown');
  await expect(select.locator('option:checked')).not.toHaveText('Piso 2');
  await expect(page.getByTestId('plan-underlay')).toHaveCount(0);
  await page.keyboard.press('PageUp');
  await expect(select.locator('option:checked')).toHaveText('Piso 2');

  // Se deshace como cualquier otro cambio.
  await page.keyboard.press('Control+z');
  await expect(select.locator('option')).toHaveCount(1);
});

test('renombrar y eliminar una planta', async ({ page }) => {
  const select = page.getByTestId('level-select');
  await page.getByTestId('level-add').click();
  await page.getByTestId('level-add-empty').click();
  await expect(select.locator('option')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Cocina/ })).toHaveCount(0);

  await page.getByTestId('level-settings').click();
  await page.getByTestId('level-name').fill('Altillo');
  await page.getByTestId('level-name').press('Enter');
  await expect(select.locator('option:checked')).toHaveText('Altillo');

  await page.getByTestId('level-remove').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(select.locator('option')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Cocina/ })).toBeVisible();
});
