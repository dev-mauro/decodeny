import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
});

test('cambia el piso de un recinto y su color', async ({ page }) => {
  await page.getByRole('button', { name: /Living-comedor/ }).click();
  const floor = page.getByTestId('finish-floor');
  await expect(page.getByTestId('finish-floor-name')).toContainText('Piso flotante roble');
  await expect(page.getByTestId('finish-floor-name')).toContainText('por defecto');

  await page.getByTestId('finish-floor-toggle').click();
  await page.getByTestId('finish-floor-option-floor.porcelain@1').click();
  await expect(page.getByTestId('finish-floor-name')).toHaveText('Porcelanato');

  await page.getByTestId('finish-floor-color').fill('#336699');
  await expect(page.getByTestId('finish-floor-color')).toHaveValue('#336699');
  // El fragüe se edita en milímetros.
  await expect(floor.getByTestId('param-finish-floor-joint')).toHaveValue('2');
});

test('el cuentagotas comparte una terminación y se puede independizar', async ({ page }) => {
  await page.getByRole('button', { name: /Living-comedor/ }).click();
  await page
    .getByTestId('finish-walls')
    .getByRole('button', { name: /Copiar terminación/ })
    .click();

  await page.getByRole('button', { name: /Dormitorio principal/ }).click();
  await page.getByTestId('finish-walls-paste').click();
  await expect(page.getByTestId('finish-walls-name')).toHaveText('Pintura mate');
  // Las caras del living más las del dormitorio (un lado dividido cuenta por tramo).
  await expect(page.getByTestId('finish-walls')).toContainText(/Usado en \d+ superficies/);

  await page.getByTestId('finish-walls-detach').click();
  await expect(page.getByTestId('finish-walls')).not.toContainText('Usado en');
});

test('las terminaciones viajan en el archivo exportado', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-project').click();
  const content = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf-8')) as {
    materials: { def: string }[];
  };
  const defs = content.materials.map((m) => m.def);
  expect(defs).toContain('floor.herringbone@1');
  expect(defs).toContain('wall.tile@1');
});
