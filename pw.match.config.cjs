const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /tmr-match-redesign-visual\.spec\.js/,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: 'artifacts/pw',
  reporter: [['line']],
  fullyParallel: true,
  workers: 3,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
