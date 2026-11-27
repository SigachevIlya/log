import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testIgnore: '**/pwa/**', fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4173', viewport: { width: 375, height: 667 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    launchOptions: process.env.LOG_BROWSER_EXECUTABLE ? { executablePath: process.env.LOG_BROWSER_EXECUTABLE } : {},
  },
  webServer: { command: process.env.LOG_PREVIEW === '1' ? 'npm run preview -- --port 4173 --strictPort' : 'npm run dev -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
