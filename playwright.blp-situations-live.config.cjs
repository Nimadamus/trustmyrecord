/**
 * The situational-filter interaction, against LIVE production.
 *
 * Separate config because it needs a signed-in session and hits the real
 * engine, so it must never run on every push. Run it deliberately:
 *
 *   TMR_TOKEN=<jwt> npx playwright test --config=playwright.blp-situations-live.config.cjs
 *
 * Without TMR_TOKEN every spec skips rather than fails.
 */
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: /blp-situations-live\.spec\.mjs/,
  timeout: 300000,
  expect: { timeout: 20000 },
  workers: 1,
  reporter: [['list']],
  outputDir: 'artifacts/blp-situations-live',
  use: { browserName: 'chromium', actionTimeout: 20000, screenshot: 'only-on-failure', trace: 'retain-on-failure', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
});
