import { expect, test, type Page } from '@playwright/test';
import { waitForScene } from './helpers';

/** Sesión colaborativa real entre dos navegadores (contextos separados) por WebRTC. */

async function openCollab(page: Page) {
  await page.getByTestId('collab-open').click();
  await expect(page.getByTestId('collab-dialog')).toBeVisible();
}

test('dos personas editan el mismo proyecto y se ven en 3D', async ({ browser }) => {
  test.slow();
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  // El anfitrión crea la sesión con el proyecto de ejemplo.
  await host.goto('/');
  await host.getByTestId('load-sample').click();
  await openCollab(host);
  await host.getByTestId('collab-name').fill('Ana');
  await host.getByTestId('collab-host').click();
  const inviteBox = host.getByTestId('collab-invite-link');
  await expect(inviteBox).toHaveValue(/#join=D1\.o\./, { timeout: 15_000 });
  const invite = await inviteBox.inputValue();

  // El invitado abre el enlace: el diálogo ofrece unirse y prepara la respuesta.
  await guest.goto(invite.replace(/^https?:\/\/[^/]+/, ''));
  await expect(guest.getByTestId('collab-dialog')).toBeVisible();
  // El código no queda en la barra de direcciones.
  expect(guest.url()).not.toContain('join=');
  await guest.getByTestId('collab-name').fill('Beto');
  await guest.getByTestId('collab-join').click();
  const answerBox = guest.getByTestId('collab-answer');
  await expect(answerBox).toHaveValue(/^D1\.a\./, { timeout: 15_000 });
  const answer = await answerBox.inputValue();

  // El anfitrión pega la respuesta y se conectan.
  await host.getByTestId('collab-answer-input').fill(answer);
  await host.getByTestId('collab-connect').click();
  await expect(host.getByTestId('collab-participants')).toContainText('Beto', { timeout: 20_000 });
  await expect(guest.getByTestId('collab-dialog')).toBeHidden({ timeout: 20_000 });
  await expect(guest.getByTestId('collab-count')).toHaveAttribute('data-count', '2');
  await host.keyboard.press('Escape');

  // El invitado recibe el proyecto del anfitrión.
  await expect(guest.getByTestId('rooms-list')).toContainText('Cocina');
  await expect(guest.getByTestId('project-name')).toHaveValue(
    await host.getByTestId('project-name').inputValue(),
  );

  // Las ediciones viajan en ambos sentidos.
  await guest.getByTestId('project-name').fill('Casa compartida');
  await guest.getByTestId('project-name').press('Enter');
  await expect(host.getByTestId('project-name')).toHaveValue('Casa compartida');
  await host.getByRole('button', { name: /Cocina/ }).click();
  await host.getByTestId('inspector-room-name').fill('Cocina comedor');
  await host.getByTestId('inspector-room-name').press('Enter');
  await expect(guest.getByTestId('rooms-list')).toContainText('Cocina comedor');

  // Deshacer es de la sesión: el invitado deshace el último cambio (del anfitrión).
  await guest.getByRole('button', { name: 'Deshacer' }).click();
  await expect(host.getByTestId('rooms-list')).not.toContainText('Cocina comedor');
  await expect(guest.getByTestId('rooms-list')).not.toContainText('Cocina comedor');

  // En 3D cada uno ve el cuerpo del otro; en el plano, no.
  await waitForScene(host);
  await waitForScene(guest);
  await expect(host.getByTestId('viewer')).toHaveAttribute('data-peers', '1');
  await expect(guest.getByTestId('viewer')).toHaveAttribute('data-peers', '1');
  await guest.getByTestId('view-plan').click();
  await expect(host.getByTestId('viewer')).not.toHaveAttribute('data-peers', /.*/);

  // El invitado sale: conserva su copia y el anfitrión vuelve a estar solo.
  await openCollab(guest);
  await guest.getByTestId('collab-leave').click();
  await openCollab(host);
  await expect(host.getByTestId('collab-participants')).not.toContainText('Beto', {
    timeout: 15_000,
  });
  await expect(guest.getByTestId('project-name')).toHaveValue('Casa compartida');

  await hostContext.close();
  await guestContext.close();
});

test('una invitación inválida se informa', async ({ page }) => {
  await page.goto('/');
  await openCollab(page);
  await page.getByTestId('collab-name').fill('Ana');
  await page.getByTestId('collab-invite-input').fill('hola');
  await page.getByTestId('collab-join').click();
  await expect(page.getByTestId('collab-error')).toBeVisible();
});
