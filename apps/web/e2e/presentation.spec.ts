import { expect, test, type Page } from '@playwright/test';
import { waitForScene } from './helpers';

/** Modo presentación y puertas operables en el recorrido (adelanto de I14). */

test('la presentación deja solo la vista, en solo lectura, y al salir todo vuelve', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await waitForScene(page);
  await page.getByTestId('presentation-start').click();

  await expect(page.getByTestId('presentation-bar')).toBeVisible();
  await expect(page.getByTestId('presentation-bar')).toContainText('Depto. ejemplo');
  await expect(page.getByTestId('project-name')).toBeHidden();
  await expect(page.getByTestId('rooms-list')).toBeHidden();
  await expect(page).toHaveURL(/presentar=1/);
  // Se recorre igual (los modos siguen a mano).
  await expect(page.getByTestId('mode-person')).toBeVisible();

  await page.getByTestId('presentation-exit').click();
  await expect(page.getByTestId('presentation-bar')).toBeHidden();
  await expect(page.getByTestId('project-name')).toBeEnabled();
  // El solo lectura de la presentación era temporal.
  await expect(page.getByTestId('read-only-badge')).toBeHidden();
  await expect(page).not.toHaveURL(/presentar=1/);
});

test('?presentar=1 abre directamente la presentación', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.goto('/?presentar=1');
  await expect(page.getByTestId('presentation-bar')).toBeVisible();
  await expect(page.getByTestId('project-name')).toBeHidden();
});

/** Un punto del plano junto a un vano, dentro de un espacio (para empezar el recorrido ahí). */
async function nextToOpening(page: Page, def: string): Promise<{ x: number; y: number }> {
  // El primer polígono del vano es el hueco en el muro (sin el arco de apertura).
  const gap = (await page
    .locator(`[data-testid="plan-opening"][data-def="${def}"]`)
    .last()
    .locator('polygon')
    .first()
    .boundingBox())!;
  const cx = gap.x + gap.width / 2;
  const cy = gap.y + gap.height / 2;
  // Perpendicular al muro, lo bastante lejos como para poder cerrar la puerta.
  const away = 40;
  const candidates =
    gap.width > gap.height
      ? [
          { x: cx, y: cy - away },
          { x: cx, y: cy + away },
        ]
      : [
          { x: cx - away, y: cy },
          { x: cx + away, y: cy },
        ];
  for (const point of candidates) {
    const inRoom = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('[data-testid^="plan-room-"]') !== null,
      point,
    );
    if (inRoom) return point;
  }
  throw new Error('No hay un espacio junto al vano');
}

test('en el recorrido, una puerta cerrada se abre y se cierra con E', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await waitForScene(page);
  await page.getByTestId('view-plan').click();
  // La puerta de entrada del ejemplo está cerrada en el documento.
  const point = await nextToOpening(page, 'door.single@1');
  await page.getByTestId('walk-from-point').click();
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-navigation-mode', 'person');

  const hint = page.getByTestId('door-hint');
  await expect(hint).toBeVisible({ timeout: 15_000 });
  const before = await hint.getAttribute('data-door-open');
  await page.keyboard.press('KeyE');
  await expect(hint).toHaveAttribute('data-door-open', before === 'true' ? 'false' : 'true');
  await page.keyboard.press('KeyE');
  await expect(hint).toHaveAttribute('data-door-open', before ?? 'false');
});
