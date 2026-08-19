const { defineConfig, devices } = require('@playwright/test');

// LIVE, read-only verification of the deployed graded-pick toast.
// Signed out, no API writes, no production alerts manufactured -- it only
// renders through the shipped functions and inspects the deployed assets.
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /notification-toasts-live\.spec\.js/,
  timeout: 90000,
  expect: { timeout: 20000 },
  outputDir: 'artifacts/notification-toasts-live-results',
  reporter: [['line']],
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
  },
});
