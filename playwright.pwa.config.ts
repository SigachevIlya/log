import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/pwa', outputDir: './test-results-pwa', workers: 1, timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:4175', viewport: { width: 375, height: 667 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', launchOptions: process.env.LOG_BROWSER_EXECUTABLE ? { executablePath: process.env.LOG_BROWSER_EXECUTABLE } : {} },
  webServer: { command: 'node tests/helpers/pwa-server.mjs', url: 'http://127.0.0.1:4175/__test__/ready', reuseExistingServer: !process.env.CI },
});
