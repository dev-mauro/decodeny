import { expect, test, type Page } from '@playwright/test';

/** Maquetas locales (ADR-0012): los proyectos guardados en este navegador. */

async function rename(page: Page, name: string) {
  await page.getByTestId('project-name').fill(name);
  await page.getByTestId('project-name').press('Enter');
}

test('las maquetas locales se listan, se abren y se eliminan', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await rename(page, 'Primera');
  await page.getByTestId('maquetas-open').click();
  await page.getByTestId('maqueta-new').click();
  await page.getByTestId('load-sample').click();
  await rename(page, 'Segunda');
  // La lista muestra lo ya guardado.
  await page.getByTestId('maquetas-open').click();
  await expect(page.getByTestId('maqueta-row').first()).toContainText('Segunda');
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.getByTestId('project-name')).toHaveValue('Segunda');
  await page.getByTestId('maquetas-open').click();
  await expect(page.getByTestId('maqueta-row')).toHaveCount(2);
  await page
    .getByTestId('maqueta-row')
    .filter({ hasText: 'Primera' })
    .getByTestId('maqueta-open')
    .click();
  await expect(page.getByTestId('project-name')).toHaveValue('Primera');

  await page.getByTestId('maquetas-open').click();
  await page
    .getByTestId('maqueta-row')
    .filter({ hasText: 'Segunda' })
    .getByTestId('maqueta-delete')
    .click();
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByTestId('maqueta-row')).toHaveCount(1);
});
