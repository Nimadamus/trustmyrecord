const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_MLB_SIMULATOR_URL || 'https://trustmyrecord.com/mlb-simulator/';
const ARTIFACT_DIR = path.join(process.cwd(), 'artifacts');
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'mlb-simulator-live-verification.png');
const REPORT_PATH = path.join(ARTIFACT_DIR, 'mlb-simulator-live-verification.json');

async function selectByVisibleText(page, selector, text) {
  const value = await page.locator(selector).evaluate((select, expected) => {
    const option = Array.from(select.options).find((item) => item.textContent.includes(expected));
    return option ? option.value : '';
  }, text);
  expect(value, `${selector} should include ${text}`).not.toBe('');
  await page.selectOption(selector, value);
}

test('live MLB Simulator supported outputs and unsupported market absence', async ({ page }) => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await expect(page.locator('body')).toContainText(/MLB Simulator/i);
  await expect(page.locator('#runSimulationButton')).toBeVisible();

  await selectByVisibleText(page, '#awayTeamSelect', 'Texas Rangers');
  await selectByVisibleText(page, '#homeTeamSelect', 'New York Yankees');
  await expect(page.locator('#awayPitcherSelect')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('#homePitcherSelect')).toBeEnabled({ timeout: 15000 });

  await page.selectOption('#simulationCountSelect', '10');
  await expect(page.locator('#runSimulationButton')).toBeEnabled();
  await page.click('#runSimulationButton');

  await expect(page.locator('#projectionShell')).toHaveAttribute('data-projection-state', 'projected', { timeout: 30000 });
  await expect(page.locator('#projectedScoreValue')).toContainText(/\d/);
  await expect(page.locator('#probabilityLab')).toContainText(/Win Probability/i);
  await expect(page.locator('#matchupNotes')).toContainText(/Simulation-based estimate|simulation output/i);
  await expect(page.locator('#inputSummary')).toContainText(/Sportsbook odds|Not used \/ not invented/i);
  await expect(page.locator('#inputSummary')).toContainText(/Official records\s+Excluded from picks and records/i);
  await expect(page.locator('body')).not.toContainText(/verified betting edge|official pick|official prediction|guaranteed|props/i);
  await expect(page.locator('body')).not.toContainText(/First Five output|F5 lean|Team Total lean/i);

  await page.evaluate((url) => {
    const proof = document.createElement('div');
    proof.setAttribute('data-live-proof-url', url);
    proof.textContent = `LIVE URL: ${url}`;
    proof.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'z-index:99999',
      'padding:10px 14px',
      'background:#101400',
      'color:#d9f99d',
      'font:700 14px ui-monospace, SFMono-Regular, Consolas, monospace',
      'border-bottom:1px solid #4d7c0f'
    ].join(';');
    document.body.prepend(proof);
  }, LIVE_URL);

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    checked_at: new Date().toISOString(),
    live_url: LIVE_URL,
    screenshot: SCREENSHOT_PATH,
  }, null, 2));
});
