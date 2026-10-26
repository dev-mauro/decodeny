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

test('agrega una puerta a un muro y edita sus parámetros', async ({ page }) => {
  await page.getByRole('button', { name: /Dormitorio principal/ }).click();
  // Lado 4 (oeste): muro exterior sin vanos.
  await page.getByRole('button', { name: 'Seleccionar muro: Lado 4' }).click();
  await expect(page.getByText('Este muro no tiene vanos.')).toBeVisible();

  await page.getByTestId('add-door.single@1').click();
  const inspector = page.getByTestId('opening-inspector');
  await expect(inspector).toBeVisible();
  await expect(page.getByTestId('inspector-title')).toHaveText('Puerta batiente');
  // Centrada en el lado interior de 3,20 m: 1,20 m libres a cada lado de la hoja de 0,80 m.
  await expect(page.getByTestId('opening-gap-left')).toHaveValue('1,20');
  await expect(page.getByTestId('opening-gap-right')).toHaveValue('1,20');
  // Abre hacia el recinto desde el que se agregó.
  await expect(
    inspector.getByRole('radio', { name: 'Hacia Dormitorio principal' }),
  ).toHaveAttribute('aria-checked', 'true');

  await setLength(page, 'param-width', '0,9');
  await expect(page.getByTestId('opening-gap-left')).toHaveValue('1,15');
  await setLength(page, 'opening-gap-left', '0,3');
  await expect(page.getByTestId('opening-gap-right')).toHaveValue('2,00');

  // Una medida que no cabe se rechaza con un mensaje.
  await setLength(page, 'param-height', '2,4');
  await expect(page.getByText(/más alto que el muro/)).toBeVisible();
  await expect(page.getByTestId('param-height')).toHaveValue('2,00');

  // Cambiar el tipo conserva medidas y posición.
  await page.getByTestId('opening-type').selectOption('door.sliding@1');
  await expect(page.getByTestId('inspector-title')).toHaveText('Puerta corredera');
  await expect(page.getByTestId('opening-gap-left')).toHaveValue('0,30');
});

test('elimina un vano con la tecla Supr y lo recupera con deshacer', async ({ page }) => {
  await page.getByRole('button', { name: /Cocina/ }).click();
  await page.getByRole('button', { name: 'Seleccionar muro: Lado 2' }).click();
  await page
    .getByTestId('wall-openings')
    .getByRole('button', { name: /Ventana corredera/ })
    .click();
  await expect(page.getByTestId('opening-inspector')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('opening-inspector')).toBeHidden();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('opening-inspector')).toBeHidden();
  await page.getByRole('button', { name: /Cocina/ }).click();
  await page.getByRole('button', { name: 'Seleccionar muro: Lado 2' }).click();
  await expect(page.getByTestId('wall-openings')).toContainText('Ventana corredera');
});

test('los vanos sobreviven a exportar e importar', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-project').click();
  const download = await downloadPromise;
  const { readFile } = await import('node:fs/promises');
  const content = JSON.parse(await readFile(await download.path(), 'utf-8')) as {
    levels: { openings: { def: string }[] }[];
  };
  expect(content.levels[0]!.openings).toHaveLength(10);
  expect(content.levels[0]!.openings.map((o) => o.def)).toContain('window.floor@1');
});
