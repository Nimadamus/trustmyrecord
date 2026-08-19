const { defineConfig, devices } = require('@playwright/test');

// Graded-pick toast + notification-polling suite.
//
// Fully self-contained: it serves this repo statically and drives
// tests/fixtures/notifications-harness.html against a scripted window.api.
// No backend, no database, no production traffic, nothing written anywhere.
// Start the static server first:
//   TMR_STATIC_PORT=5502 node tests/static-server.cjs
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /notification-toasts\.spec\.js/,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: 'artifacts/notification-toasts-results',
  reporter: [['line']],
  workers: 1,
  use: {
    baseURL: process.env.TMR_LOCAL_SITE_URL || 'http://localhost:5502',
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
  },
});
