import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.getByTestId('view-plan').click();
  await expect(page.getByTestId('plan-view')).toBeVisible();
});

test('la planta comparte la selección y muestra cotas', async ({ page }) => {
  await page.getByTestId('plan-room-Cocina').click();
  await expect(page.getByTestId('room-inspector')).toBeVisible();
  await expect(page.getByTestId('inspector-room-name')).toHaveValue('Cocina');
  await expect(page.getByTestId('plan-dimension')).toHaveCount(4);
  // Cuatro esquinas arrastrables (sin los nodos intermedios en T).
  await expect(page.getByTestId('plan-node')).toHaveCount(4);
});

test('arrastrar una esquina cambia la forma del recinto y se puede deshacer', async ({ page }) => {
  await page.getByRole('button', { name: /Cocina/ }).click();
  await expect(page.getByTestId('room-side-1')).toHaveValue('2,40');
  // La esquina más al este y al sur: se arrastra hacia la derecha.
  const corners = page.getByTestId('plan-node');
  const boxes = await Promise.all((await corners.all()).map((c) => c.boundingBox()));
  const se = boxes
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => b.x + b.y - (a.x + a.y))[0]!;
  const x = se.x + se.width / 2;
  const y = se.y + se.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 4, y);
  await page.mouse.up();
  const side = await page.getByTestId('room-side-1').inputValue();
  expect(Number(side.replace(',', '.'))).toBeGreaterThan(2.4);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('room-side-1')).toHaveValue('2,40');
});

test('descarga la planta como imagen', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('capture').click();
  const png = await readFile(await (await downloadPromise).path());
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
});

test('un espacio no habitable no suma a la superficie útil y se ve rayado', async ({ page }) => {
  await expect(page.getByTestId('total-area')).toHaveText('50,58 m²');
  await page.getByTestId('plan-room-Baño').click();
  await page.getByTestId('room-uninhabitable').check();
  await expect(page.getByTestId('total-area')).toHaveText('46,62 m²');
  await expect(page.getByRole('button', { name: /Baño/ })).toContainText('No habitable');
  await expect(page.getByTestId('plan-room-closed-Baño')).toBeAttached();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByTestId('total-area')).toHaveText('50,58 m²');
  await expect(page.getByTestId('plan-room-closed-Baño')).toHaveCount(0);
});
