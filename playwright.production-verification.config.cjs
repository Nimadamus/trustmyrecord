const { defineConfig, devices } = require('@playwright/test');

// PRODUCTION. Read-only against live data: it signs in with a minted token to
// LOOK at private pages, and the one write it attempts is a duplicate report
// the server must refuse. Needs TMR_JWT_SECRET and TMR_ADMIN_TOKEN.
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /production-verification\.spec\.js/,
  timeout: 180000,
  expect: { timeout: 45000 },
  outputDir: 'artifacts/production-verification-results',
  reporter: [['line']],
  workers: 1,
  use: {
    baseURL: 'https://trustmyrecord.com',
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
