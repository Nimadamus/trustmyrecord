/**
 * BetLegend Pro acceptance run against PRODUCTION.
 *
 * Separate config because these specs are slow (the engine sleeps on a free
 * instance; a cold start alone is 28-53s), need credentials, and must never be
 * mixed into a suite that runs on every push. Run it deliberately:
 *
 *   BLP_LIVE_SUB_USER=... BLP_LIVE_SUB_PASS=... npm run test:blp-live
 *
 * The FREE-tier fixture is no longer supplied: the run creates its own through
 * helpers/automationAccount.mjs (marked automation at INSERT time, so it is
 * excluded from member counts, feeds, leaderboards, coins and /u/ bakes) and
 * globalTeardown deletes it. Set TMR_QA_DATABASE_URL to let teardown do that;
 * BLP_LIVE_FREE_USER still overrides it with an account of your own, which is
 * treated as borrowed and never deleted.
 *
 * Without subscriber credentials those persona tests skip rather than fail, so
 * the logged-out and paywall checks still run anywhere.
 */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: /betlegend-pro-live\.spec\.mjs/,
  // Signs in once per role and saves the session. Logging in per test meant 16
  // logins across the two projects, and the auth route rate-limits at 15 per
  // IP per window on purpose.
  globalSetup: './tests/e2e/blp-live-setup.mjs',
  // Deletes the free-tier account the run created. Never touches one supplied
  // through BLP_LIVE_FREE_USER.
  globalTeardown: './tests/e2e/blp-live-teardown.mjs',
  timeout: 180000,
  expect: { timeout: 30000 },
  outputDir: 'artifacts/blp-live-results',
  reporter: [['list']],
  // One worker: the engine is a single 512Mi instance with a concurrency bound
  // of one heavy scan, so parallel reports queue behind each other anyway and
  // only make the timeouts harder to read.
  workers: 1,
  retries: 1,
  use: {
    browserName: 'chromium',
    actionTimeout: 30000,
    navigationTimeout: 60000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
});
