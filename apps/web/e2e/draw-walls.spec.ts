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

async function clickPlan(page: Page, x: number, y: number) {
  const p = await toScreen(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function movePlan(page: Page, x: number, y: number) {
  const p = await toScreen(page, x, y);
  await page.mouse.move(p.x, p.y);
}

test('dibuja muros en la planta, cierra un recinto, lo divide y une', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('empty-draw-walls').click();
  await expect(page.getByTestId('plan-tool-wall')).toHaveAttribute('aria-checked', 'true');
  // Con teclado no hay panel de indicaciones (solo en pantallas táctiles).
  await expect(page.getByTestId('wall-draw-hint')).toBeHidden();

  // Primer punto con clic; los tramos, escribiendo el largo en la dirección del cursor.
  await clickPlan(page, 0, 0);
  await movePlan(page, 1500, 0);
  await page.keyboard.type('4');
  await expect(page.getByTestId('plan-draw-length')).toContainText('4');
  await page.keyboard.press('Enter');
  await movePlan(page, 4000, 1500);
  await page.keyboard.type('300 cm');
  await page.keyboard.press('Enter');
  await movePlan(page, 2000, 3000);
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  // Cierra en el punto inicial: se crea el recinto.
  await clickPlan(page, 0, 0);
  await expect(page.getByTestId('rooms-list')).toContainText('Espacio 1');

  // Tabique de muro a muro: divide el recinto en dos.
  await clickPlan(page, 1500, 0);
  await clickPlan(page, 1500, 3000);
  await expect(page.getByTestId('rooms-list')).toContainText('Espacio 2');

  // Seleccionar el tabique y borrarlo: vuelve a ser un solo recinto.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('plan-tool-select')).toHaveAttribute('aria-checked', 'true');
  await clickPlan(page, 1500, 1500);
  await expect(page.getByTestId('wall-inspector')).toBeVisible();
  await page.getByTestId('delete-wall').click();
  await expect(page.getByTestId('rooms-list')).not.toContainText('Espacio 2');
  await expect(page.getByTestId('rooms-list')).toContainText('Espacio 1');
});

test('los extremos de un muro se editan por coordenadas', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('empty-draw-walls').click();
  await clickPlan(page, 0, 0);
  await movePlan(page, 1500, 0);
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await clickPlan(page, 1000, 0);
  await expect(page.getByTestId('wall-inspector')).toBeVisible();
  await expect(page.getByTestId('wall-ends')).toBeVisible();
  const endX = page.getByTestId('wall-end-x');
  await endX.fill('3');
  await endX.press('Enter');
  await expect(page.getByTestId('wall-inspector')).toContainText('3,00 m');
});

test('lo que se dibuja es el interior: 2 m × 1 m dejan 2 × 1 m libres entre muro y muro', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('empty-draw-walls').click();
  await clickPlan(page, 0, 0);
  // Escribiendo el largo y Enter, en la dirección del cursor.
  for (const [length, x, y, dx, dy] of [
    ['2', 0, 0, 1, 0],
    ['1', 2000, 0, 0, 1],
    ['2', 2000, 1000, -1, 0],
    ['1', 0, 1000, 0, -1],
  ] as const) {
    await movePlan(page, x + dx * 500, y + dy * 500);
    await page.keyboard.type(length);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByTestId('rooms-list')).toContainText('Espacio 1');
  // Antes quedaba (2 − 0,15) × (1 − 0,15) = 1,57 m².
  await expect(page.getByTestId('rooms-list')).toContainText('2,00 m²');
  // Un solo paso de deshacer quita el último tramo (y el ajuste a las caras).
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByTestId('rooms-list')).toBeHidden();
});
