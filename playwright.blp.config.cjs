/**
 * BetLegend Pro end-to-end config.
 *
 * Separate from playwright.regression.config.cjs, which is a visual-baseline
 * suite with its own static server and a testMatch that only picks up
 * regression-lock.spec.js. These specs serve the shipped page off disk with a
 * stubbed API, so they need no server and no baselines -- mixing them into
 * that config would either drag the server up for nothing or, worse, leave
 * them silently unmatched (which is how tests/e2e ended up orphaned before).
 */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: /betlegend-pro\.spec\.mjs/,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: 'artifacts/blp-playwright-results',
  reporter: [['list']],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    browserName: 'chromium',
    actionTimeout: 10000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
