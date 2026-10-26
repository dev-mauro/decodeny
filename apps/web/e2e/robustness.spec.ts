import { expect, test } from '@playwright/test';

test('la vista se recupera si el navegador pierde el contexto WebGL', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await page.waitForTimeout(500);
  const restored = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid=viewer] canvas');
    const gl = canvas?.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return 'sin extensión';
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 300));
    ext.restoreContext();
    await new Promise((r) => setTimeout(r, 800));
    return 'ok';
  });
  test.skip(restored !== 'ok', 'El navegador no expone WEBGL_lose_context');
  await expect(page.getByText('reinició los gráficos 3D')).toBeVisible();
  await expect(page.getByTestId('viewport-error')).toBeHidden();
  expect(errors).toEqual([]);
});
