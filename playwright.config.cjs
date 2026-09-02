const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /sportsbook-live-verification\.spec\.js/,
  timeout: 90000,
  // CI_RETRIES_20260902: a live proof against production retries transient
  // failures; a real regression fails every attempt and still fails the run.
  retries: process.env.CI ? 2 : 0,
  expect: { timeout: 15000 },
  outputDir: 'artifacts/playwright-results',
  reporter: [['line']],
  use: {
    baseURL: 'https://trustmyrecord.com',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1200 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
