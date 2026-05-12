const { defineConfig, devices } = require('@playwright/test');

const localBaseURL = 'http://127.0.0.1:4173';
const baseURL = process.env.TMR_REGRESSION_BASE_URL || localBaseURL;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /regression-lock\.spec\.js/,
  timeout: 120000,
  expect: {
    timeout: 20000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.04,
      threshold: 0.25,
    },
  },
  outputDir: 'artifacts/regression-playwright-results',
  reporter: [['line']],
  snapshotPathTemplate: 'tests/visual-baselines/{arg}{ext}',
  webServer: process.env.TMR_REGRESSION_SKIP_SERVER === '1' ? undefined : {
    command: 'node scripts/serve-static-regression.js',
    url: localBaseURL,
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: {
    baseURL,
    browserName: 'chromium',
    actionTimeout: 20000,
    navigationTimeout: 45000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 900 },
        deviceScaleFactor: 2,
      },
    },
  ],
});
