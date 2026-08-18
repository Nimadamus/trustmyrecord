const { defineConfig, devices } = require('@playwright/test');

// LOCAL only. The suite reroutes every production API call to localhost, and it writes rows, so
// it must never be pointed at trustmyrecord.com. Start the local backend (node server.js in
// trustmyrecord-backend) and the static server (node tests/static-server.cjs) before running.
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /tmr-challenges-cancel-mobile\.spec\.js/,
  timeout: 120000,
  expect: { timeout: 25000 },
  outputDir: 'artifacts/challenges-extra-playwright-results',
  reporter: [['line']],
  workers: 1,
  use: {
    baseURL: process.env.TMR_LOCAL_SITE_URL || 'http://localhost:5500',
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
  },
});
