const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_TRENDSPOTTER_URL || 'https://trustmyrecord.com/trendspotter/';
const API_URL = process.env.TMR_TRENDSPOTTER_API_URL || 'https://trustmyrecord-api.onrender.com/api/trendspotter/verified?sport=MLB';
const ARTIFACT_DIR = path.join(process.cwd(), 'artifacts');
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'trendspotter-live-verification.png');
const REPORT_PATH = path.join(ARTIFACT_DIR, 'trendspotter-live-verification.json');

test('live Trend Spotter guided flow and safe output', async ({ page }) => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const apiResponse = await page.request.get(API_URL, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(apiResponse.status(), 'Trendspotter API should be live').toBe(200);
  const apiBody = await apiResponse.json();
  expect(apiBody.source, 'API source must be source-backed').toBe('source_backed_historical_database');
  expect(Number(apiBody.matchup_count || 0), 'API should expose current matchup context').toBeGreaterThan(0);

  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await expect(page.locator('body')).toContainText('Trend Spotter');
  await expect(page.locator('body')).toContainText('Select Matchup');
  await expect(page.locator('body')).toContainText('Select Trend Type');

  await page.selectOption('#sportSelect', 'MLB');
  await expect(page.locator('#matchupSelect option[value]').nth(1)).toBeAttached({ timeout: 30000 });
  const matchupValue = await page.locator('#matchupSelect option[value]').nth(1).getAttribute('value');
  await page.selectOption('#matchupSelect', matchupValue);

  await page.locator('[data-market="moneyline"]').click();
  await expect(page.locator('#thresholdField')).toBeHidden();
  await expect(page.locator('#teamField')).toBeHidden();
  await expect(page.locator('#sideSelect')).toContainText(/away|home/i);

  await page.locator('[data-market="spread"]').click();
  await expect(page.locator('#thresholdField')).toBeVisible();
  await expect(page.locator('#sideSelect')).toContainText(/away|home/i);

  await page.locator('[data-market="total"]').click();
  await expect(page.locator('#thresholdField')).toBeVisible();
  await expect(page.locator('#teamField')).toBeHidden();
  await expect(page.locator('#sideSelect')).toContainText(/Over/);
  await expect(page.locator('#sideSelect')).toContainText(/Under/);

  await page.locator('[data-market="team_total"]').click();
  await expect(page.locator('#thresholdField')).toBeVisible();
  await expect(page.locator('#teamField')).toBeVisible();

  await page.locator('[data-market="first_half"]').click();
  await expect(page.locator('#periodSelect')).toContainText(/First half/i);

  await page.locator('[data-market="first_five"]').click();
  await expect(page.locator('#periodSelect')).toContainText(/First five innings/i);

  await page.selectOption('#sportSelect', 'NBA');
  await expect(page.locator('[data-market="first_five"]')).toBeDisabled();
  await expect(page.locator('[data-market="props"]')).toBeDisabled();

  await page.selectOption('#sportSelect', 'MLB');
  await expect(page.locator('#matchupSelect option[value]').nth(1)).toBeAttached({ timeout: 30000 });
  const secondMatchupValue = await page.locator('#matchupSelect option[value]').nth(1).getAttribute('value');
  await page.selectOption('#matchupSelect', secondMatchupValue);
  await page.locator('[data-market="total"]').click();
  await page.selectOption('#sideSelect', 'over');
  await page.fill('#thresholdInput', '8.5');
  await page.click('#generateTrend');

  const result = page.locator('#resultsList');
  await expect(result).toContainText(/No strong trend found|No verified trend|Verified source rows/i);
  await expect(page.locator('body')).not.toContainText(/fake stats|fake projections|fake confidence|fake ROI|fake records|fake win percentage|betting edge/i);

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
      'background:#021018',
      'color:#67e8f9',
      'font:700 14px ui-monospace, SFMono-Regular, Consolas, monospace',
      'border-bottom:1px solid #155e75'
    ].join(';');
    document.body.prepend(proof);
  }, LIVE_URL);

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    checked_at: new Date().toISOString(),
    live_url: LIVE_URL,
    api_url: API_URL,
    api_status: apiResponse.status(),
    api_source: apiBody.source,
    api_trend_count: apiBody.trend_count,
    api_matchup_count: apiBody.matchup_count,
    screenshot: SCREENSHOT_PATH,
  }, null, 2));
});
