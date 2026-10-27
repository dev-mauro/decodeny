import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
});

test('se elige con un clic dónde empieza el recorrido', async ({ page }) => {
  await page.getByTestId('view-plan').click();
  await page.getByTestId('walk-from-point').click();
  await expect(page.getByTestId('walk-start-hint')).toBeVisible();

  // Fuera de los recintos: avisa y sigue esperando el clic.
  await page.getByTestId('plan-view').click({ position: { x: 5, y: 5 } });
  await expect(page.getByText('Elige un punto dentro de un recinto.')).toBeVisible();
  await expect(page.getByTestId('walk-start-hint')).toBeVisible();

  // En el piso del dormitorio: empieza el recorrido (vista 3D, modo persona).
  const room = (await page.getByTestId('plan-room-Dormitorio 2').boundingBox())!;
  await page.mouse.click(room.x + room.width / 2, room.y + room.height / 2);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-navigation-mode', 'person');
  await expect(page.getByTestId('walk-overlay')).toBeVisible();
});

test('Esc cancela la elección; el balanceo de cabeza se recuerda', async ({ page }) => {
  await page.getByTestId('walk-from-point').click();
  await expect(page.getByTestId('walk-start-hint')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('walk-start-hint')).toBeHidden();

  await page.getByTestId('mode-person').click();
  const headBob = page.getByTestId('head-bob');
  await expect(headBob).not.toBeChecked();
  await headBob.check();
  await page.reload();
  await page.getByTestId('mode-person').click();
  await expect(page.getByTestId('head-bob')).toBeChecked();
});
