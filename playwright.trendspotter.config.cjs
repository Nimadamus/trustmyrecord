const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /trendspotter-live-verification\.spec\.js/,
  outputDir: 'artifacts/trendspotter-playwright-results',
  timeout: 90000,
  retries: 0,
  use: {
    baseURL: 'https://trustmyrecord.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
    },
  ],
});
