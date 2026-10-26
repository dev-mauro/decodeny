import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('carga plantillas de inicio', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-template-studio').click();
  await expect(page.getByTestId('rooms-list')).toContainText('Living-dormitorio');
  await expect(page.getByTestId('project-name')).toHaveValue('Estudio');

  await page.getByRole('button', { name: 'Nuevo' }).click();
  await page.getByRole('button', { name: 'Crear nuevo' }).click();
  await page.getByTestId('load-template-2d2b').click();
  await expect(page.getByTestId('rooms-list')).toContainText('Baño en suite');
  await expect(page.getByTestId('rooms-list')).toContainText('Baño 2');
});

test('mide la distancia entre dos puntos de la vista', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.keyboard.press('m');
  await expect(page.getByTestId('measure-panel')).toContainText('Haz clic en dos puntos');
  const box = (await page.getByTestId('viewer').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await expect(page.getByTestId('measure-distance')).toHaveText(/\d+,\d{2} m/);
  await expect(page.getByTestId('measure-label')).toBeVisible();
  // Medir no selecciona nada; Esc termina.
  await expect(page.getByTestId('room-inspector')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('measure-panel')).toBeHidden();
});

test('capas, corte de muros y captura de imagen', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.getByTestId('toggle-layers').click();
  await page.getByTestId('layer-furniture').uncheck();
  await expect(page.getByTestId('layer-furniture')).not.toBeChecked();
  await page.getByTestId('layer-section').check();
  await expect(page.getByTestId('section-height')).toHaveValue('1,20');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('capture').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^depto-ejemplo-2d1b-\d{4}-\d{2}-\d{2}\.png$/);
  const png = await readFile(await download.path());
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(png.length).toBeGreaterThan(10_000);
});
