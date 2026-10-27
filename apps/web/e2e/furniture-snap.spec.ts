import { expect, test, type Page } from '@playwright/test';

async function setLength(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId);
  await input.fill(value);
  await input.press('Enter');
}

/** Agrega un mueble del catálogo (lo deja en el lugar sugerido) y lo ubica por medidas. */
async function addItem(page: Page, def: string, x: string, y: string) {
  await page.getByTestId(`catalog-${def}`).click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('item-inspector')).toBeVisible();
  await setLength(page, 'item-x', x);
  await setLength(page, 'item-y', y);
}

test('un velador arrastrado cerca de la cama se junta a su costado y alinea el respaldo', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('add-room').click();
  await setLength(page, 'room-width', '4');
  await setLength(page, 'room-depth', '3');
  await page.getByTestId('create-room-submit').click();
  await page.getByTestId('tab-catalog').click();

  // Cama de 1,40 × 2,00 con el borde derecho en x = 1,925 y el respaldo en y = 2,50.
  await addItem(page, 'furniture.bed@1', '1,225', '1,5');
  await setLength(page, 'param-width', '1,4');
  await setLength(page, 'param-depth', '2');
  // Velador de 0,45 × 0,40 a 6 cm de la cama y 3 cm más adelante que su respaldo.
  await addItem(page, 'furniture.nightstand@1', '2,21', '2,27');

  await page.getByTestId('view-plan').click();
  const box = (await page.getByTestId('plan-item-Velador').boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 3, from.y + 3);
  await page.mouse.move(from.x + 1, from.y + 6);
  await page.mouse.up();

  await expect(page.getByTestId('item-x')).toHaveValue('2,15');
  await expect(page.getByTestId('item-y')).toHaveValue('2,30');
});
