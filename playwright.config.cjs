const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /sportsbook-live-verification\.spec\.js/,
  timeout: 90000,
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
