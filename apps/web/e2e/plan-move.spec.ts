import { expect, test, type Page } from '@playwright/test';

/** Tres espacios vacíos de 3 × 3 m, creados por medidas. */
async function threeRooms(page: Page) {
  for (const name of ['Uno', 'Dos', 'Tres']) {
    await page.getByTestId('add-room').click();
    await page.getByTestId('room-name').fill(name);
    for (const id of ['room-width', 'room-depth']) {
      await page.getByTestId(id).fill('3');
      await page.getByTestId(id).press('Enter');
    }
    await page.getByTestId('create-room-submit').click();
    await expect(page.getByTestId('rooms-list')).toContainText(name);
  }
  await page.getByTestId('view-plan').click();
  await expect(page.getByTestId('plan-view')).toBeVisible();
}

const box = async (page: Page, name: string) =>
  (await page.getByTestId(`plan-room-${name}`).boundingBox())!;

async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(from.x + (dx * i) / 12, from.y + (dy * i) / 12);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await threeRooms(page);
});

test('un espacio se arrastra directo, sin seleccionarlo antes', async ({ page }) => {
  const before = await box(page, 'Uno');
  await dragBy(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 }, 0, 120);
  await expect(page.getByTestId('inspector-room-name')).toHaveValue('Uno');
  const after = await box(page, 'Uno');
  expect(after.y - before.y).toBeGreaterThan(80);
  // Los demás no se movieron.
  const other = await box(page, 'Dos');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  expect(Math.abs((await box(page, 'Dos')).y - other.y)).toBeLessThan(2);
  await expect.poll(async () => Math.abs((await box(page, 'Uno')).y - before.y)).toBeLessThan(2);
});

test('con Shift se juntan espacios y se mueven juntos', async ({ page }) => {
  const one = await box(page, 'Uno');
  const two = await box(page, 'Dos');
  const three = await box(page, 'Tres');
  await page.mouse.click(two.x + two.width / 2, two.y + two.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.click(three.x + three.width / 2, three.y + three.height / 2);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('room-group-note')).toContainText('2 espacios seleccionados');
  await dragBy(page, { x: three.x + three.width / 2, y: three.y + three.height / 2 }, 0, 150);
  const moved2 = (await box(page, 'Dos')).y - two.y;
  const moved3 = (await box(page, 'Tres')).y - three.y;
  expect(moved2).toBeGreaterThan(100);
  expect(Math.abs(moved2 - moved3)).toBeLessThan(3);
  expect(Math.abs((await box(page, 'Uno')).y - one.y)).toBeLessThan(2);
});

test('el trackpad desplaza el plano y arrastrar al borde lo corre', async ({ page }) => {
  const plan = page.getByTestId('plan-view');
  const viewBox = () => plan.getAttribute('viewBox');
  const initial = await viewBox();
  const area = (await plan.boundingBox())!;
  // Deslizar con dos dedos (deltas finos, de costado): desplaza, no acerca.
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(30, 0);
  await expect.poll(viewBox).not.toBe(initial);
  const [, , w1] = (await viewBox())!.split(' ').map(Number);
  const [, , w0] = initial!.split(' ').map(Number);
  expect(w1).toBeCloseTo(w0!, 3);

  // Arrastrar un espacio hasta el borde: el plano se corre mientras se sostiene ahí.
  const one = await box(page, 'Uno');
  await page.mouse.move(one.x + one.width / 2, one.y + one.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width - 5, one.y + one.height / 2, { steps: 10 });
  const pinned = await viewBox();
  await page.waitForTimeout(400);
  expect(await viewBox()).not.toBe(pinned);
  await page.mouse.up();
});
