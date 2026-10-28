import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Salas de colaboración con código (ADR-0014) contra los emuladores de Firebase:
 * `pnpm e2e:cloud`. La conexión entre navegadores es WebRTC real; solo la señalización pasa por
 * Firestore. Cada página se trae al frente antes de usarla (en segundo plano, Chromium frena
 * sus temporizadores).
 */
test.skip(!process.env.E2E_CLOUD, 'Requiere los emuladores de Firebase (pnpm e2e:cloud).');

async function person(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function openCollab(page: Page, name: string) {
  await page.bringToFront();
  await page.getByTestId('collab-open').click();
  await page.getByTestId('collab-name').fill(name);
}

test('se crea una sala y varias personas se unen con el código', async ({ browser }) => {
  test.slow();
  const ana = await person(browser);
  const beto = await person(browser);
  const carla = await person(browser);

  // El plano en vez de la vista 3D: tres páginas con WebGL por software saturan el runner de CI.
  await ana.goto('/');
  await ana.getByTestId('load-sample').click();
  await ana.getByTestId('view-plan').click();
  await openCollab(ana, 'Ana');
  await ana.getByTestId('collab-room-host').click();
  const codeBox = ana.getByTestId('collab-room-code');
  await expect(codeBox).toHaveAttribute('data-code', /^[A-Z2-9]{6}$/, { timeout: 20_000 });
  const code = (await codeBox.getAttribute('data-code'))!;
  const link = await ana.getByTestId('collab-room-link').inputValue();
  expect(link).toContain(`?sala=${code}`);

  // Beto escribe el código como se lo dictaron (minúsculas, con guion).
  await beto.goto('/');
  await beto.getByTestId('view-plan').click();
  await openCollab(beto, 'Beto');
  await beto
    .getByTestId('collab-room-input')
    .fill(`${code.slice(0, 3).toLowerCase()}-${code.slice(3).toLowerCase()}`);
  await beto.getByTestId('collab-room-join').click();
  await ana.bringToFront();
  await expect(ana.getByTestId('collab-participants')).toContainText('Beto', { timeout: 30_000 });
  await beto.bringToFront();
  await expect(beto.getByTestId('collab-count')).toHaveAttribute('data-count', '2', {
    timeout: 20_000,
  });
  await expect(beto.getByTestId('rooms-list')).toContainText('Cocina');

  // Carla entra con el enlace: la sala sigue abierta para más personas.
  await carla.bringToFront();
  await carla.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(carla.getByTestId('collab-dialog')).toBeVisible();
  await expect(carla.getByTestId('collab-room-input')).toHaveValue(code);
  expect(carla.url()).not.toContain('sala=');
  await carla.getByTestId('collab-name').fill('Carla');
  await carla.getByTestId('collab-room-join').click();
  await ana.bringToFront();
  await expect(ana.getByTestId('collab-participants')).toContainText('Carla', { timeout: 30_000 });
  await carla.bringToFront();
  await expect(carla.getByTestId('collab-count')).toHaveAttribute('data-count', '3', {
    timeout: 20_000,
  });

  // Las ediciones viajan entre todos.
  await carla.keyboard.press('Escape');
  await expect(carla.getByTestId('collab-dialog')).toBeHidden();
  await carla.getByTestId('view-plan').click();
  await carla.getByTestId('project-name').fill('Casa de los tres');
  await carla.getByTestId('project-name').press('Enter');
  await beto.bringToFront();
  await expect(beto.getByTestId('project-name')).toHaveValue('Casa de los tres');
  await ana.bringToFront();
  await expect(ana.getByTestId('project-name')).toHaveValue('Casa de los tres');
});

test('un código que no existe se informa; a mano sigue disponible', async ({ page }) => {
  await page.goto('/');
  await openCollab(page, 'Beto');
  await page.getByTestId('collab-room-input').fill('ZZZ-ZZZ');
  await page.getByTestId('collab-room-join').click();
  await expect(page.getByTestId('collab-error')).toContainText('No hay una sala abierta');
  await page.getByTestId('collab-manual').click();
  await expect(page.getByTestId('collab-host')).toBeVisible();
  await expect(page.getByTestId('collab-invite-input')).toBeVisible();
});
