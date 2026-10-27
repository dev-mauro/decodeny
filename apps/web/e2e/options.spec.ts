import { expect, test, type Page } from '@playwright/test';

async function toScreen(page: Page, x: number, y: number) {
  const svg = page.getByTestId('plan-view');
  const box = (await svg.boundingBox())!;
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox'))!.split(' ').map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return { x: box.x + ((x - vx) / vw) * box.width, y: box.y + ((-y - vy) / vh) * box.height };
}

test('solo lectura: no se puede editar, se recuerda y se desactiva desde Opciones', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.getByTestId('options').click();
  await page.getByTestId('option-read-only').check();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('read-only-badge')).toBeVisible();

  await page.getByRole('button', { name: /Cocina/ }).click();
  await expect(page.getByTestId('inspector-room-name')).toBeDisabled();
  await expect(page.getByTestId('add-room')).toBeDisabled();
  // Borrar con el teclado no hace nada.
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('rooms-list')).toContainText('Cocina');

  await page.reload();
  await expect(page.getByTestId('read-only-badge')).toBeVisible();
  await page.getByTestId('options').click();
  await page.getByTestId('option-read-only').uncheck();
  await expect(page.getByTestId('read-only-badge')).toBeHidden();
});

test('la cuadrícula se ve en el plano y se elige su ancho', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.getByTestId('view-plan').click();
  await expect(page.getByTestId('plan-grid')).toBeHidden();
  await page.getByTestId('options').click();
  await page.getByTestId('option-grid').check();
  await page.getByTestId('option-grid-step').selectOption('250');
  await expect(page.getByTestId('plan-grid')).toBeVisible();
  await expect(page.locator('#plan-grid')).toHaveAttribute('width', '250');
});

test('muros exactos con largo y dirección, sin teclado; guías al quedar parejo', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('empty-draw-walls').click();
  await expect(page.getByTestId('wall-length')).toBeDisabled();
  const start = await toScreen(page, 0, 0);
  await page.mouse.click(start.x, start.y);
  await expect(page.getByTestId('wall-length')).toBeEnabled();
  for (const dir of ['right', 'up', 'left', 'down']) {
    await page.getByTestId('wall-length').fill('3');
    await page.getByTestId(`wall-dir-${dir}`).click();
  }
  await expect(page.getByTestId('rooms-list')).toContainText('Espacio 1');

  // Un tramo paralelo más arriba muestra la guía al llegar a la x del muro existente.
  const a = await toScreen(page, 0, 3700);
  await page.mouse.click(a.x, a.y);
  const near = await toScreen(page, 2960, 3700);
  await page.mouse.move(near.x - 20, near.y);
  await page.mouse.move(near.x, near.y);
  // (Una línea vertical tiene caja de ancho cero: se comprueba que exista, no su "visibilidad".)
  await expect(page.getByTestId('plan-draw-guide')).not.toHaveCount(0);
  await expect(page.getByTestId('plan-draw-length')).toHaveText('3,00 m');
});
