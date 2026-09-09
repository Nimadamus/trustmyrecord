// Football player props, driven as a user. Headless, one worker, no visible
// window: this repo's hard rule is that nothing opens a browser on the desktop.
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /football-player-props-live\.spec\.js/,
  timeout: 5 * 60 * 1000,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    headless: true,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
  },
});
