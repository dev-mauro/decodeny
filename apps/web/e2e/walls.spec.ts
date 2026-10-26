import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
});

test('los recintos adosados comparten muro y se nombra por lado', async ({ page }) => {
  await page.getByRole('button', { name: /Cocina/ }).click();
  // Lado 4 (oeste) de la cocina es el tabique con el living.
  await expect(page.getByTestId('room-side-row-4')).toContainText('Compartido');
  await page.getByRole('button', { name: 'Seleccionar muro: Lado 4' }).click();

  await expect(page.getByTestId('inspector-title')).toHaveText('Lado 4');
  const owners = page.getByTestId('wall-owners');
  await expect(owners).toContainText('Cocina');
  await expect(owners).toContainText('Living-comedor');
  await expect(page.getByText('Muro compartido por')).toBeVisible();

  // Ver el mismo muro desde el living cambia su nombre automático.
  await owners.getByRole('button', { name: 'Living-comedor' }).click();
  await expect(page.getByTestId('room-inspector')).toBeVisible();
});

test('el nombre propio de un muro reemplaza al automático y se puede quitar', async ({ page }) => {
  await page.getByRole('button', { name: /Baño/ }).click();
  await page.getByRole('button', { name: 'Seleccionar muro: Lado 1' }).click();
  const name = page.getByTestId('wall-name');
  await expect(name).toHaveAttribute('placeholder', 'Lado 1');
  await name.fill('Muro de la ducha');
  await name.press('Enter');
  await expect(page.getByTestId('inspector-title')).toHaveText('Muro de la ducha');

  await page.getByRole('button', { name: 'Baño', exact: true }).click();
  await expect(page.getByTestId('room-side-row-1')).toContainText('Muro de la ducha');

  await page.getByRole('button', { name: 'Seleccionar muro: Muro de la ducha' }).click();
  await page.getByTestId('wall-name').fill('');
  await page.getByTestId('wall-name').press('Enter');
  await expect(page.getByTestId('inspector-title')).toHaveText('Lado 1');
});

test('el panel izquierdo y el de propiedades se desplazan sin ocultar opciones', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.getByRole('button', { name: /Living-comedor/ }).click();
  const remove = page.getByTestId('delete-room');
  await remove.scrollIntoViewIfNeeded();
  await expect(remove).toBeInViewport();
  await expect(page.getByTestId('total-area')).toBeInViewport();
});
