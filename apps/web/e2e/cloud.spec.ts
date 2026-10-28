import { expect, test, type Page } from '@playwright/test';

/**
 * Maquetas compartidas (ADR-0012) contra los emuladores de Firebase: `pnpm e2e:cloud`.
 * Cada contexto es un navegador distinto (su propia base local y su propia identidad anónima).
 * Antes de usar una página se la trae al frente: en segundo plano, Chromium frena sus
 * temporizadores (y con ellos el guardado y la subida agrupados).
 */
test.skip(!process.env.E2E_CLOUD, 'Requiere los emuladores de Firebase (pnpm e2e:cloud).');

async function rename(page: Page, name: string) {
  const field = page.getByTestId('project-name');
  await field.fill(name);
  await field.press('Enter');
  await expect(field).toHaveValue(name);
}

/** Hace un cambio en una maqueta compartida y espera a que la nube tenga la revisión nueva. */
async function renameSynced(page: Page, name: string) {
  const button = page.getByTestId('share-open');
  await expect(button).toHaveAttribute('data-cloud-rev', /^\d+$/);
  const rev = Number(await button.getAttribute('data-cloud-rev'));
  await rename(page, name);
  await expect(button, 'la revisión de la nube sube con el cambio').toHaveAttribute(
    'data-cloud-rev',
    String(rev + 1),
    { timeout: 20_000 },
  );
  await expect(button).toHaveAttribute('data-cloud-status', 'saved');
}

async function shareCurrent(page: Page): Promise<string> {
  await page.getByTestId('share-open').click();
  await page.getByTestId('share-confirm').click();
  const link = page.getByTestId('share-link');
  await expect(link).toHaveValue(/\?maqueta=/, { timeout: 20_000 });
  const url = await link.inputValue();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('share-dialog')).toBeHidden();
  return url.replace(/^https?:\/\/[^/]+/, '');
}

test('compartir, abrir el enlace en otro navegador y editar crea una copia', async ({
  browser,
}) => {
  test.slow();
  const anaContext = await browser.newContext();
  const betoContext = await browser.newContext();
  const ana = await anaContext.newPage();
  const beto = await betoContext.newPage();

  // Ana arma una maqueta y la comparte.
  await ana.bringToFront();
  await ana.goto('/');
  await ana.getByTestId('load-sample').click();
  await rename(ana, 'Depto de Ana');
  const link = await shareCurrent(ana);
  expect(new URL(ana.url()).searchParams.get('maqueta')).not.toBeNull();
  await expect(ana.getByTestId('share-open')).toHaveAttribute('data-cloud-status', 'saved');

  // Sus cambios se suben solos.
  await renameSynced(ana, 'Depto de Ana v2');

  // Beto abre el enlace: la ve tal cual, como maqueta de otra persona.
  await beto.bringToFront();
  await beto.goto(link);
  await expect(beto.getByTestId('visit-badge')).toBeVisible({ timeout: 20_000 });
  await expect(beto.getByTestId('project-name')).toHaveValue('Depto de Ana v2');
  await expect(beto.getByTestId('rooms-list')).toContainText('Cocina');

  // Al editar se crea su propia copia (y deja de apuntar al enlace de Ana).
  await rename(beto, 'Versión de Beto');
  await expect(beto.getByTestId('visit-badge')).toBeHidden();
  await expect.poll(() => new URL(beto.url()).searchParams.get('maqueta')).toBeNull();
  await beto.getByTestId('maquetas-open').click();
  await expect(beto.getByTestId('maqueta-row')).toHaveCount(1);
  await expect(beto.getByTestId('maqueta-row')).toContainText('Versión de Beto');
  await beto.keyboard.press('Escape');

  // El original no cambió: quien lo abre de nuevo ve lo de Ana.
  const carla = await (await browser.newContext()).newPage();
  await carla.bringToFront();
  await carla.goto(link);
  await expect(carla.getByTestId('project-name')).toHaveValue('Depto de Ana v2', {
    timeout: 20_000,
  });

  // Ana, en su navegador, abre su propio enlace y sigue editando el original (sin copia).
  await ana.bringToFront();
  await ana.goto(link);
  await expect(ana.getByTestId('project-name')).toHaveValue('Depto de Ana v2');
  await expect(ana.getByTestId('visit-badge')).toBeHidden();
  await renameSynced(ana, 'Depto de Ana final');
  await carla.bringToFront();
  await carla.reload();
  await expect(carla.getByTestId('project-name')).toHaveValue('Depto de Ana final', {
    timeout: 20_000,
  });

  await anaContext.close();
  await betoContext.close();
});

test('un enlace que no existe avisa y abre lo propio', async ({ page }) => {
  await page.goto('/?maqueta=no-existe');
  await expect(page.getByText('Este enlace no existe o ya desapareció.')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('visit-badge')).toBeHidden();
});
