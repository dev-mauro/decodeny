import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.getByTestId('tab-catalog').click();
});

test('un mueble nuevo sigue al puntero en la planta y queda donde se hace clic', async ({
  page,
}) => {
  await page.getByTestId('view-plan').click();
  await page.getByTestId('catalog-furniture.chair-dining@1').click();
  await expect(page.getByTestId('placement-hint')).toBeVisible();

  // Clic en el centro del baño: la silla queda ahí, aunque se sugería otro recinto.
  const bath = (await page.getByTestId('plan-room-Baño').boundingBox())!;
  const target = { x: bath.x + bath.width / 2, y: bath.y + bath.height / 2 };
  await page.mouse.move(target.x - 40, target.y);
  await page.mouse.move(target.x, target.y);
  await page.mouse.click(target.x, target.y);

  await expect(page.getByTestId('placement-hint')).toBeHidden();
  await expect(page.getByTestId('item-inspector')).toContainText('Baño');
  // Un solo paso de deshacer: deshacer lo quita.
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByTestId('item-inspector')).toBeHidden();
});

test('en la vista 3D se ubica con un clic; Esc cancela sin agregar nada', async ({ page }) => {
  const viewer = page.getByTestId('viewer');
  await page.getByTestId('catalog-furniture.sofa@1').click();
  await expect(viewer).toHaveAttribute('data-placing', 'true');
  await page.keyboard.press('Escape');
  await expect(viewer).not.toHaveAttribute('data-placing', 'true');
  await expect(page.getByTestId('item-inspector')).toBeHidden();

  await page.getByTestId('catalog-furniture.sofa@1').click();
  const box = (await viewer.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('inspector-title')).toHaveText('Sofá');
});

test('al editar la terminación, la vista muestra el color real sin el brillo de selección', async ({
  page,
}) => {
  await page.getByTestId('tab-rooms').click();
  await page.getByRole('button', { name: /Cocina/ }).click();
  const viewer = page.getByTestId('viewer');
  await expect(viewer).not.toHaveAttribute('data-true-surface-colors', 'true');
  await page.getByTestId('finish-floor').hover();
  await expect(viewer).toHaveAttribute('data-true-surface-colors', 'true');
  await page.getByTestId('viewer').hover();
  await expect(viewer).not.toHaveAttribute('data-true-surface-colors', 'true');
});
