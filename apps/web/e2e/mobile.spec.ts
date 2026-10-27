import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForScene } from './helpers';

/** Gesto táctil con varios dedos: eventos de puntero `touch` (Playwright solo simula toques). */
async function touch(
  target: Locator,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  x: number,
  y: number,
) {
  await target.dispatchEvent(type, {
    pointerId,
    pointerType: 'touch',
    isPrimary: pointerId === 1,
    clientX: x,
    clientY: y,
    bubbles: true,
    buttons: type === 'pointerup' ? 0 : 1,
  });
}

async function loadSample(page: Page) {
  await page.goto('/');
  await page.getByTestId('load-sample').tap();
  await waitForScene(page);
}

test('layout móvil: la vista ocupa la pantalla y los paneles se abren como hojas', async ({
  page,
}) => {
  await loadSample(page);
  await expect(page.getByTestId('mobile-sheet')).toBeHidden();
  await page.getByTestId('mobile-tab-rooms').tap();
  await expect(page.getByTestId('mobile-sheet')).toBeVisible();
  // Elegir un recinto muestra sus propiedades.
  await page.getByRole('button', { name: /Dormitorio 2/ }).tap();
  await expect(page.getByTestId('room-inspector')).toBeVisible();
  await expect(page.getByTestId('mobile-tab-inspector')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('mobile-sheet-close').tap();
  await expect(page.getByTestId('mobile-sheet')).toBeHidden();

  // Archivo e idioma en el menú de la barra superior.
  await page.getByTestId('topbar-more').tap();
  await expect(page.getByTestId('menu-export')).toBeVisible();
});

test('un mueble se ubica con un toque: la hoja del catálogo se cierra', async ({ page }) => {
  await loadSample(page);
  await page.getByTestId('mobile-tab-catalog').tap();
  await page.getByTestId('catalog-furniture.armchair@1').tap();
  await expect(page.getByTestId('mobile-sheet')).toBeHidden();
  await expect(page.getByTestId('placement-hint')).toBeVisible();
  const box = (await page.getByTestId('viewer').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('placement-hint')).toBeHidden();
  await page.getByTestId('mobile-tab-inspector').tap();
  await expect(page.getByTestId('inspector-title')).toHaveText('Sillón');
});

test('en el recorrido hay joystick; se sale con la barra', async ({ page }) => {
  await loadSample(page);
  await page.getByTestId('mode-person').tap();
  const controls = page.getByTestId('touch-controls');
  await expect(controls).toBeVisible();
  await expect(page.getByTestId('walk-overlay')).toBeHidden();
  const stick = (await page.getByTestId('touch-joystick').boundingBox())!;
  const cx = stick.x + stick.width / 2;
  const cy = stick.y + stick.height / 2;
  const knob = page.getByTestId('touch-joystick').locator('div');
  const before = await knob.evaluate((el) => el.style.top);
  await touch(controls, 'pointerdown', 1, cx, cy);
  await touch(controls, 'pointermove', 1, cx, cy - 40);
  await expect.poll(() => knob.evaluate((el) => el.style.top)).not.toBe(before);
  await touch(controls, 'pointerup', 1, cx, cy - 40);
  await expect.poll(() => knob.evaluate((el) => el.style.top)).toBe(before);

  await page.getByTestId('exit-walk').tap();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-navigation-mode', 'edit');
});

test('en la planta, pellizcar hace zoom', async ({ page }) => {
  await loadSample(page);
  await page.getByTestId('view-plan').tap();
  const plan = page.getByTestId('plan-view');
  const box = (await plan.boundingBox())!;
  const width = async () => Number((await plan.getAttribute('viewBox'))!.split(' ')[2]);
  const before = await width();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await touch(plan, 'pointerdown', 1, cx - 40, cy);
  await touch(plan, 'pointerdown', 2, cx + 40, cy);
  await touch(plan, 'pointermove', 1, cx - 120, cy);
  await touch(plan, 'pointermove', 2, cx + 120, cy);
  await touch(plan, 'pointerup', 1, cx - 120, cy);
  await touch(plan, 'pointerup', 2, cx + 120, cy);
  // Separar los dedos acerca la vista: el viewBox muestra menos planta.
  await expect.poll(width).toBeLessThan(before * 0.6);
});
