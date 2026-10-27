import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/** Escribe una medida en un campo y la confirma con Enter. */
async function setLength(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId);
  await input.fill(value);
  await input.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Comienza con las medidas' })).toBeVisible();
});

test('crea un recinto rectangular por medidas y lo edita', async ({ page }) => {
  await page.getByTestId('add-room').click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo recinto' });
  await expect(dialog).toBeVisible();
  await page.getByTestId('room-name').fill('Living');
  await setLength(page, 'room-width', '5,2');
  await setLength(page, 'room-depth', '380 cm');
  await page.getByTestId('create-room-submit').click();

  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('rooms-list')).toContainText('Living');
  await expect(page.getByTestId('room-area')).toHaveText('19,76 m²');
  await expect(page.getByTestId('room-side-1')).toHaveValue('5,20');
  // Cotas 3D del recinto seleccionado.
  await expect(page.getByTestId('dimension-label')).toHaveCount(4);

  await setLength(page, 'room-side-1', '6');
  await expect(page.getByTestId('room-area')).toHaveText('22,80 m²');
  await expect(page.getByTestId('room-side-3')).toHaveValue('6,00');

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByTestId('room-area')).toHaveText('19,76 m²');
  await page.getByRole('button', { name: 'Rehacer' }).click();
  await expect(page.getByTestId('room-area')).toHaveText('22,80 m²');
});

test('valida medidas inválidas sin aplicar cambios', async ({ page }) => {
  await page.getByTestId('add-room').click();
  await setLength(page, 'room-width', 'abc');
  await expect(page.getByText('Ingresa una medida válida, p. ej. 3,50')).toBeVisible();
  await setLength(page, 'room-width', '0,02');
  await expect(page.getByText(/Debe ser al menos/)).toBeVisible();
});

test('crea un recinto en L por tramos', async ({ page }) => {
  await page.getByTestId('add-room').click();
  await page.getByRole('tab', { name: 'Por tramos' }).click();
  // Recorrido inicial 4 × 3: se convierte en una L agregando dos tramos.
  await setLength(page, 'segment-length-1', '6');
  await setLength(page, 'segment-length-2', '2');
  await setLength(page, 'segment-length-3', '3');
  await page.getByRole('combobox', { name: 'Giro 3' }).selectOption('right');
  await setLength(page, 'segment-length-4', '2');
  await page.getByRole('button', { name: 'Agregar tramo' }).click();
  await page.getByRole('button', { name: 'Agregar tramo' }).click();
  await setLength(page, 'segment-length-5', '3');
  await setLength(page, 'segment-length-6', '4');
  await expect(page.getByText('El contorno cierra correctamente.')).toBeVisible();
  await page.getByTestId('create-room-submit').click();

  await expect(page.getByTestId('room-area')).toHaveText('18,00 m²');
  await expect(page.getByTestId('dimension-label')).toHaveCount(6);
});

test('exporta e importa el proyecto conservando los datos', async ({ page }) => {
  await page.getByTestId('load-sample').click();
  await expect(page.getByTestId('total-area')).toHaveText('50,58 m²');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-project').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('depto-ejemplo-2d1b.decodeny.json');
  const content = await readFile(await download.path(), 'utf-8');
  expect(JSON.parse(content)).toMatchObject({
    schemaVersion: 1,
    meta: { name: 'Depto. ejemplo 2D1B' },
  });

  // Proyecto nuevo y reimportación del archivo exportado.
  await page.getByRole('button', { name: 'Nuevo' }).click();
  await page.getByRole('button', { name: 'Crear nuevo' }).click();
  await expect(page.getByText('Aún no hay recintos.')).toBeVisible();

  await page.getByTestId('file-input').setInputFiles({
    name: 'depto.decodeny.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
  await expect(page.getByTestId('total-area')).toHaveText('50,58 m²');
  await expect(page.getByTestId('project-name')).toHaveValue('Depto. ejemplo 2D1B');
});

test('informa archivos inválidos al importar', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'roto.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion": 1, "meta": {}}'),
  });
  await expect(page.getByTestId('import-error')).toContainText('formato inválido');
});

test('restaura el proyecto guardado automáticamente al recargar', async ({ page }) => {
  await page.getByTestId('load-sample').click();
  await expect(page.getByTestId('total-area')).toHaveText('50,58 m²');
  // Espera a que el autoguardado (con debounce) quede escrito en IndexedDB.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('decodeny');
        open.onerror = () => resolve(false);
        open.onsuccess = () => {
          const db = open.result;
          // Cada sondeo cierra su conexión: dejarlas abiertas interfiere con la base de la app.
          if (!db.objectStoreNames.contains('autosave')) {
            db.close();
            resolve(false);
            return;
          }
          const get = db.transaction('autosave').objectStore('autosave').get('current');
          get.onsuccess = () => {
            db.close();
            resolve(String(get.result ?? '').includes('Depto. ejemplo 2D1B'));
          };
          get.onerror = () => {
            db.close();
            resolve(false);
          };
        };
      }),
    undefined,
    { timeout: 10_000 },
  );
  await page.reload();
  await expect(page.getByTestId('total-area')).toHaveText('50,58 m²');
});

test('elimina un recinto y permite deshacer desde la notificación', async ({ page }) => {
  await page.getByTestId('load-sample').click();
  await page.getByRole('button', { name: /Baño/ }).click();
  await page.getByTestId('delete-room').click();
  await expect(page.getByTestId('rooms-list')).not.toContainText('Baño');
  await page.getByRole('status').getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByTestId('rooms-list')).toContainText('Baño');
});
