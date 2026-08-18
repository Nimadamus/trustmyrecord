const { defineConfig, devices } = require('@playwright/test');

// Runs against the LIVE site and the LIVE API. Read only: no fixtures, no seeded data, no
// writes. Every write path is verified by confirming it is refused, so a post-deploy run leaves
// nothing behind on a site members can see.
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /tmr-challenges-live\.spec\.js/,
  timeout: 120000,
  expect: { timeout: 30000 },
  outputDir: 'artifacts/challenges-live-results',
  reporter: [['line']],
  workers: 1,
  use: {
    baseURL: process.env.TMR_LIVE_BASE_URL || 'https://trustmyrecord.com',
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
  },
});
