const { defineConfig, devices } = require('@playwright/test');

// Runs against the live site. No local server, no fixtures, no seeded data: the whole point
// is that the Earn page is verified against real backend state for a real account.
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /tmr-earn-live\.spec\.js/,
  timeout: 120000,
  expect: { timeout: 25000 },
  outputDir: 'artifacts/earn-playwright-results',
  reporter: [['line']],
  workers: 1,
  use: {
    baseURL: process.env.TMR_EARN_BASE_URL || 'https://trustmyrecord.com',
    ...devices['Desktop Chrome'],
    headless: true,
    ignoreHTTPSErrors: false,
    trace: 'retain-on-failure',
  },
});
