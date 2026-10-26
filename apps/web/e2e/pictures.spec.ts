import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

/** PNG de 1 × 1 píxel (proporción cuadrada). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('un cuadro con foto propia viaja en el .zip exportado y se recupera al abrirlo', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.getByRole('button', { name: /Living-comedor/ }).click();
  await page.getByTestId('tab-catalog').click();
  await page.getByTestId('catalog-decor.picture@1').click();
  // Queda en el lugar sugerido (Enter); también se puede ubicar con el puntero.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inspector-title')).toHaveText('Cuadro');

  await page.getByTestId('param-image').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByTestId('param-image-preview')).toBeVisible();
  // Foto cuadrada: la parte visible (60 cm − marco y paspartú) queda cuadrada.
  await expect(page.getByTestId('param-height')).toHaveValue('0,60');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-project').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('depto-ejemplo-2d1b.decodeny.zip');
  const zip = await readFile(await download.path());
  expect(zip.subarray(0, 2).toString('latin1')).toBe('PK');

  // Proyecto nuevo y reapertura del .zip: el cuadro vuelve con su imagen.
  await page.getByRole('button', { name: 'Nuevo' }).click();
  await page.getByRole('button', { name: 'Crear nuevo' }).click();
  await page.getByTestId('file-input').setInputFiles({
    name: 'depto.decodeny.zip',
    mimeType: 'application/zip',
    buffer: zip,
  });
  await page.getByTestId('tab-rooms').click();
  await expect(page.getByTestId('total-area')).toHaveText('50,58 m²');
  await page.getByRole('button', { name: /Living-comedor/ }).click();
  await page
    .getByTestId('room-furniture')
    .getByRole('button', { name: /Cuadro/ })
    .click();
  await expect(page.getByTestId('param-image-preview')).toBeVisible();
});

test('rechaza archivos que no son imágenes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.getByTestId('tab-catalog').click();
  await page.getByTestId('catalog-decor.picture@1').click();
  // Queda en el lugar sugerido (Enter); también se puede ubicar con el puntero.
  await page.keyboard.press('Enter');
  await page.getByTestId('param-image').setInputFiles({
    name: 'nota.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hola'),
  });
  await expect(page.getByText('Formato de imagen no admitido')).toBeVisible();
});
