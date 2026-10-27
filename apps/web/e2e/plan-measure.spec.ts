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

async function setLength(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId);
  await input.fill(value);
  await input.press('Enter');
}

test('en la planta se mide de esquina a esquina interior, con ajuste', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('add-room').click();
  await setLength(page, 'room-width', '4');
  await setLength(page, 'room-depth', '3');
  await page.getByTestId('create-room-submit').click();
  await page.getByTestId('view-plan').click();

  await page.getByTestId('toggle-measure').click();
  await expect(page.getByTestId('measure-panel')).toBeVisible();
  // Clics cerca (no exactamente) de las esquinas interiores: se enganchan a ellas.
  const a = await toScreen(page, 40, 30);
  const b = await toScreen(page, 3960, -20);
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y);
  await expect(page.getByTestId('plan-measure-length')).toBeVisible();
  await page.mouse.click(b.x, b.y);
  await expect(page.getByTestId('measure-distance')).toHaveText('4,00 m');
  await expect(page.getByTestId('plan-measure-length')).toHaveText('4,00 m');

  // La medición sigue activa al pasar a 3D (con los puntos borrados).
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('measure-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('measure-panel')).toBeHidden();
});
