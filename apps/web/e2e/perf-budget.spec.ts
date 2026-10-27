import { expect, test } from '@playwright/test';
import { waitForScene } from './helpers';

/**
 * Presupuesto de dibujo (§8.4 del plan): las draw calls no dependen de la GPU, así que se miden
 * de forma estable aun con WebGL por software. Límites con margen sobre lo medido; si una
 * mejora los baja, conviene bajarlos también (subirlos es una decisión explícita).
 */
const BUDGET = {
  sample: { drawCalls: 450, triangles: 18_000 },
  '2d2b': { drawCalls: 420, triangles: 14_000 },
};

for (const [id, budget] of Object.entries(BUDGET)) {
  test(`la plantilla ${id} se dibuja dentro del presupuesto`, async ({ page }) => {
    await page.goto('/?perf');
    await page.getByTestId(`load-template-${id}`).click();
    await waitForScene(page);
    const read = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              decodenyPerf?: () => { drawCalls: number; triangles: number } | null;
            }
          ).decodenyPerf?.() ?? null,
      );
    // Se mide cuando la escena terminó de montarse: dos lecturas seguidas iguales.
    let stats: { drawCalls: number; triangles: number } | null = null;
    for (let previous = -1, i = 0; i < 40; i++) {
      stats = await read();
      if (stats && stats.drawCalls > 0 && stats.drawCalls === previous) break;
      previous = stats?.drawCalls ?? -1;
      await page.waitForTimeout(250);
    }
    if (!stats) throw new Error('El visor no expuso estadísticas (?perf)');
    expect(stats.drawCalls).toBeLessThanOrEqual(budget.drawCalls);
    expect(stats.triangles).toBeLessThanOrEqual(budget.triangles);
  });
}
