// Handicapping Hub integrity spec: headless, one worker, no visible window.
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /handicapping-hub-integrity\.spec\.js/,
  timeout: 10 * 60 * 1000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { headless: true, ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1200 } },
});
