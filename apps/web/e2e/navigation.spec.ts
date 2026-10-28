import { expect, test } from '@playwright/test';
import { waitForScene } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('el recorrido requiere al menos un recinto', async ({ page }) => {
  await expect(page.getByTestId('mode-person')).toBeDisabled();
  await expect(page.getByTestId('mode-ghost')).toBeEnabled();
});

test('alterna entre edición, recorrido y vuelo libre', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByTestId('load-sample').click();
  await waitForScene(page);
  const viewer = page.getByTestId('viewer');

  await page.getByTestId('mode-person').click();
  await expect(viewer).toHaveAttribute('data-navigation-mode', 'person');
  await expect(page.getByTestId('walk-overlay')).toContainText('Haz un recorrido por la maqueta.');
  // Moverse con el teclado cierra la presentación y no produce errores (física bajo demanda).
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  await expect(page.getByTestId('walk-overlay')).toBeHidden();
  await expect(page.getByTestId('walk-hud')).toBeVisible();

  await page.keyboard.press('3');
  await expect(viewer).toHaveAttribute('data-navigation-mode', 'ghost');
  await expect(page.getByTestId('walk-overlay')).toContainText('Subir / bajar');
  // «Comenzar» también la cierra.
  await page.getByTestId('walk-begin').click();
  await expect(page.getByTestId('walk-overlay')).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(viewer).toHaveAttribute('data-navigation-mode', 'edit');
  await expect(page.getByTestId('walk-overlay')).toBeHidden();

  await page.keyboard.press('2');
  await expect(viewer).toHaveAttribute('data-navigation-mode', 'person');
  await page.getByTestId('exit-walk').click();
  await expect(viewer).toHaveAttribute('data-navigation-mode', 'edit');

  // Un clic fuera de la presentación también la cierra.
  await page.keyboard.press('3');
  await expect(page.getByTestId('walk-overlay')).toBeVisible();
  await page.getByTestId('walk-overlay').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('walk-overlay')).toBeHidden();

  expect(errors).toEqual([]);
});

test('en recorrido no se selecciona ni se eliminan recintos con el teclado', async ({ page }) => {
  await page.getByTestId('load-sample').click();
  await page.getByRole('button', { name: /Baño/ }).click();
  await page.getByTestId('mode-ghost').click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('rooms-list')).toContainText('Baño');
});
