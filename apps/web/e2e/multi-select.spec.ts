import { expect, test, type Page } from '@playwright/test';

/** Posición en pantalla de un punto de la planta (mm), según el viewBox del SVG. */
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

const planItem = (page: Page, name: string) => page.getByTestId(`plan-item-${name}`);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.getByTestId('view-plan').click();
});

test('Shift + clic suma y quita muebles; el grupo se borra en un paso', async ({ page }) => {
  await planItem(page, 'Sofá').click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Sofá');
  await planItem(page, 'Mesa de centro').click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('inspector-title')).toHaveText('2 muebles seleccionados');
  await expect(page.getByTestId('multi-item-list')).toContainText('Sofá');
  await expect(page.getByTestId('multi-item-list')).toContainText('Mesa de centro');

  // Shift sobre uno seleccionado lo quita.
  await planItem(page, 'Sofá').click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('inspector-title')).toHaveText('Mesa de centro');
  await planItem(page, 'Sofá').click({ modifiers: ['Shift'] });

  await page.getByTestId('delete-items').click();
  await expect(page.getByTestId('multi-item-inspector')).toBeHidden();
  await expect(planItem(page, 'Sofá')).toHaveCount(0);
  // Un solo paso de deshacer (el aviso también lo ofrece).
  await page.getByTitle('Deshacer (Ctrl+Z)').click();
  await expect(planItem(page, 'Sofá')).toHaveCount(1);
  await expect(planItem(page, 'Mesa de centro')).toHaveCount(1);
});

test('Shift + arrastrar en la planta selecciona un área; Ctrl+A selecciona todo', async ({
  page,
}) => {
  // Recuadro alrededor de la mesa de comedor y sus sillas.
  const a = await toScreen(page, 3800, 2300);
  const b = await toScreen(page, 5600, 100);
  await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2);
  await expect(page.getByTestId('plan-area-select')).toBeVisible();
  await page.mouse.move(b.x, b.y);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('plan-area-select')).toBeHidden();
  const list = page.getByTestId('multi-item-list');
  await expect(list).toContainText('Mesa rectangular');
  await expect(list).toContainText('Silla de comedor');
  await expect(list).not.toContainText('Sofá');

  // Un clic simple sobre uno del grupo lo deja seleccionado solo.
  await planItem(page, 'Mesa rectangular').click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Mesa rectangular');

  await page.getByTestId('plan-view').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('inspector-title')).toHaveText(/\d+ muebles seleccionados/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('multi-item-inspector')).toBeHidden();
});
