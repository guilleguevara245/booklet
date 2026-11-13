import { defineConfig, devices } from '@playwright/test';

// Pruebas de punta a punta: la API compilada y la web en modo desarrollo, contra
// PostgreSQL y Redis reales (docker compose en local, servicios en CI).
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://booklet:booklet@localhost:5432/booklet';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
export const WEB_URL = 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // En una máquina sin los navegadores de Playwright se puede usar un Chrome instalado.
        launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
      },
    },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../apps/api',
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: !process.env.CI,
      env: { DATABASE_URL, REDIS_URL, PORT: '3000', CORS_ORIGIN: WEB_URL, NODE_ENV: 'test' },
    },
    {
      command: 'pnpm exec vite --port 5173 --strictPort',
      cwd: '../apps/web',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
