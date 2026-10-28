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

test('una escalera en U entre dos plantas: hueco arriba y aviso si no llega', async ({ page }) => {
  const select = page.getByTestId('level-select');
  await page.getByTestId('level-add').click();
  await page.getByTestId('level-add-outline').click();
  await expect(select.locator('option:checked')).toHaveText('Piso 2');
  await page.keyboard.press('PageDown');
  await expect(select.locator('option:checked')).toHaveText(/Piso 1|Planta/);

  // Se ubica desde el catálogo, con la altura de piso a piso ya ajustada.
  await page.getByRole('button', { name: /Living-comedor/ }).click();
  await page.getByTestId('tab-catalog').click();
  await page.getByTestId('catalog-search').fill('escalera en u');
  await page.getByTestId('catalog-stairs.u@1').click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inspector-title')).toHaveText('Escalera en U');
  await expect(page.getByTestId('item-storey-warning')).toHaveCount(0);

  // Arriba, el plano muestra el hueco que abre la escalera.
  await page.getByTestId('view-plan').click();
  await expect(page.getByTestId('plan-item-Escalera en U')).toBeVisible();
  await page.keyboard.press('PageUp');
  await expect(page.getByTestId('plan-void')).toBeAttached();

  // Si la planta de arriba sube, la escalera ya no llega: se avisa y se ajusta.
  await page.getByTestId('tab-rooms').click();
  await page.getByTestId('level-settings').click();
  await page.getByTestId('level-elevation').fill('3,5');
  await page.getByTestId('level-elevation').press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('PageDown');
  await page.getByTestId('plan-item-Escalera en U').click();
  await expect(page.getByTestId('item-storey-warning')).toBeVisible();
  await page.getByTestId('item-fit-storey').click();
  await expect(page.getByTestId('item-storey-warning')).toHaveCount(0);
  await expect(page.getByTestId('param-height')).toHaveValue('3,50');
});

test('en el recorrido, se usa la botonera del ascensor y viaja entre plantas', async ({ page }) => {
  test.setTimeout(90_000);
  const select = page.getByTestId('level-select');
  await page.getByTestId('level-add').click();
  await page.getByTestId('level-add-outline').click();
  await page.keyboard.press('PageDown');
  await expect(select.locator('option:checked')).toHaveText('Piso 1');

  // Hay uno de vidrio y otro de metal.
  await page.getByRole('button', { name: /Living-comedor/ }).click();
  await page.getByTestId('tab-catalog').click();
  await page.getByTestId('catalog-search').fill('ascensor');
  await expect(page.getByTestId('catalog-structure.elevator-metal@1')).toBeVisible();
  await page.getByTestId('catalog-structure.elevator@1').click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inspector-title')).toHaveText('Ascensor de vidrio');

  // El recorrido empieza dentro de la cabina.
  await page.getByTestId('view-plan').click();
  await page.getByTestId('walk-from-point').click();
  const cabin = (await page.getByTestId('plan-item-Ascensor de vidrio').boundingBox())!;
  await page.mouse.click(cabin.x + cabin.width / 2, cabin.y + cabin.height / 2);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-navigation-mode', 'person');
  await page.bringToFront();
  await page.getByTestId('walk-begin').click();

  // Adentro, la botonera: E muestra los pisos; elegir uno los cierra y el ascensor parte.
  const hint = page.getByTestId('elevator-hint');
  await expect(hint).toHaveAttribute('data-elevator-action', 'panel', { timeout: 30_000 });
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('elevator-panel')).toBeVisible();
  await expect(page.getByTestId('elevator-stop-1')).toBeDisabled();
  await page.getByTestId('elevator-stop-2').click();
  await expect(page.getByTestId('elevator-panel')).toBeHidden();

  // Llega arriba: la botonera ya marca el Piso 2 como el actual.
  await expect(hint).toHaveAttribute('data-elevator-stop', 'Piso 2', { timeout: 20_000 });
  await expect(hint).toHaveAttribute('data-elevator-action', 'panel');
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('elevator-stop-2')).toBeDisabled({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('elevator-panel')).toBeHidden();

  // La planta activa pasó a ser la de arriba.
  await page.getByTestId('mode-edit').click();
  await page.getByTestId('tab-rooms').click();
  await expect(select.locator('option:checked')).toHaveText('Piso 2');
});
