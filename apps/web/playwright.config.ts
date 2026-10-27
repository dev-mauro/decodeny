import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

const browser = {
  ...(isCI ? {} : { channel: 'chrome' as const }),
  // WebGL por software para que el canvas 3D funcione en modo headless.
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // En CI, además del resumen, el reporte HTML (con trazas de los reintentos) como artefacto.
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // WebGL por software (SwiftShader) y la vista 3D cargada bajo demanda: con varios workers el
  // primer render puede tardar más que los 5 s por defecto.
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts/,
      // Localmente usa el Chrome instalado (evita descargar navegadores); en CI, el de Playwright.
      use: {
        ...devices['Desktop Chrome'],
        ...browser,
      },
    },
    {
      // Teléfono táctil (layout móvil, joystick, gestos): solo los specs móviles.
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'], ...browser },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
