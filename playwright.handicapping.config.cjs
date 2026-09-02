// Handicapping Hub integrity spec: headless, one worker, no visible window.
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /handicapping-hub-integrity\.spec\.js/,
  timeout: 10 * 60 * 1000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // actionTimeout: a click on a card that the live board keeps re-rendering
  // (in-progress game) must fail loudly, never wait forever.
  use: { headless: true, ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1200 }, actionTimeout: 30_000, navigationTimeout: 90_000 },
});
