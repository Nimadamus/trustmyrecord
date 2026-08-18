const { defineConfig, devices } = require('@playwright/test');

// LOCAL only. The suite reroutes every production API call to localhost and it writes rows,
// so it must never be pointed at trustmyrecord.com. Start the local backend (node server.js in
// trustmyrecord-backend) and this repo's static server on 5501:
//   TMR_STATIC_PORT=5501 node tests/static-server.cjs
// 5501 rather than 5500 because another clone may already be serving 5500.
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /tmr-match\.spec\.js/,
  timeout: 120000,
  expect: { timeout: 25000 },
  outputDir: 'artifacts/match-playwright-results',
  reporter: [['line']],
  workers: 1,
  use: {
    baseURL: process.env.TMR_LOCAL_SITE_URL || 'http://localhost:5501',
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
  },
});
