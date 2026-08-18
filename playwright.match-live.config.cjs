const { defineConfig, devices } = require('@playwright/test');

// LIVE site and LIVE API. Read only: it posts no offer, fills nothing and moves no TMR, so a
// post-deploy run leaves no invented orders in a market members can see.
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /tmr-match-live\.spec\.js/,
  timeout: 120000,
  expect: { timeout: 30000 },
  outputDir: 'artifacts/match-live-results',
  reporter: [['line']],
  workers: 1,
  use: {
    baseURL: process.env.TMR_LIVE_BASE_URL || 'https://trustmyrecord.com',
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
  },
});
