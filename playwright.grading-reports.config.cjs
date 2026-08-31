const { defineConfig, devices } = require('@playwright/test');

// LOCAL only. The suite reroutes every production API call to localhost and it writes rows
// (grading_reports, notifications) plus fixture picks, so it must never be pointed at
// trustmyrecord.com. Start both first:
//   trustmyrecord-backend:  node server.js        (port 3000, tmr_stripe_test database)
//   this repo:              node tests/static-server.cjs  (port 5500)
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /grading-reports\.spec\.js/,
  timeout: 120000,
  expect: { timeout: 25000 },
  outputDir: 'artifacts/grading-reports-playwright-results',
  reporter: [['line']],
  workers: 1,
  use: {
    baseURL: process.env.TMR_LOCAL_SITE_URL || 'http://localhost:5500',
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
