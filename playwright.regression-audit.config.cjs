const { defineConfig, devices } = require('@playwright/test');

// Config for tests/session-and-frontend-regression.spec.js -- the frontend
// regression suite added during the 2026-07-26 production audit. Separate
// from playwright.config.cjs (which only matches sportsbook-live-verification)
// so this suite can be run/extended independently.
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /session-and-frontend-regression\.spec\.js/,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: 'artifacts/playwright-results-regression-audit',
  reporter: [['line']],
  use: {
    baseURL: 'https://trustmyrecord.com',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
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
