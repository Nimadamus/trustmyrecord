// Model Builder end-to-end verification, run as a real member against
// production. Serial and single-worker on purpose: the suite saves one model,
// watches it, then deletes it, and two workers would fight over that model.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'model-builder-live.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 30000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.TMR_SITE || 'https://trustmyrecord.com',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 30000,
    navigationTimeout: 60000,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
