const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_TRENDSPOTTER_URL || 'https://trustmyrecord.com/trendspotter/';
const API_URL = process.env.TMR_TRENDSPOTTER_API_URL || 'https://trustmyrecord-api.onrender.com/api/trendspotter/verified?sport=MLB';
const ARTIFACT_DIR = path.join(process.cwd(), 'artifacts');
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'trendspotter-live-verification.png');
const REPORT_PATH = path.join(ARTIFACT_DIR, 'trendspotter-live-verification.json');

async function selectFirstLiveMatchup(page) {
  await expect(page.locator('#matchupSelect')).toBeEnabled({ timeout: 30000 });
  await expect.poll(async () => page.locator('#matchupSelect').evaluate((select) => {
    return Array.from(select.options).filter((option) => option.value).length;
  }), { message: 'live matchup options should load' }).toBeGreaterThan(0);
  const value = await page.locator('#matchupSelect').evaluate((select) => {
    return Array.from(select.options).find((option) => option.value)?.value || '';
  });
  await page.selectOption('#matchupSelect', value);
  return value;
}

test('live Trend Spotter guided flow and safe output', async ({ page }) => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const apiResponse = await page.request.get(API_URL, {
    headers: { 'cache-control': 'no-cache' },
  });
  const apiBody = apiResponse.status() === 200 ? await apiResponse.json() : {};
  if (apiResponse.status() === 200) {
    expect(apiBody.source, 'API source must be source-backed').toBe('source_backed_historical_database');
    expect(Number(apiBody.matchup_count || 0), 'API should expose current matchup context').toBeGreaterThan(0);
  }

  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await expect(page.locator('body')).toContainText('Trend Spotter');
  await expect(page.locator('body')).toContainText('Select Matchup');
  await expect(page.locator('body')).toContainText('Select Trend Type');

  await page.selectOption('#sportSelect', 'MLB');
  await selectFirstLiveMatchup(page);

  await page.locator('[data-market="moneyline"]').click();
  await expect(page.locator('#trendKindSelect')).toContainText(/Team win trend/i);
  await expect(page.locator('#trendKindSelect')).not.toContainText(/Full game over/i);
  await expect(page.locator('#thresholdField')).toBeHidden();
  await expect(page.locator('#teamField')).toBeHidden();
  await expect(page.locator('#sideSelect')).toContainText(/away|home/i);

  await page.locator('[data-market="spread"]').click();
  await expect(page.locator('#thresholdField')).toBeVisible();
  await expect(page.locator('#sideSelect')).toContainText(/away|home/i);

  await page.locator('[data-market="total"]').click();
  await expect(page.locator('#trendKindSelect')).toContainText(/Full game over \/ under/i);
  await expect(page.locator('#thresholdField')).toBeVisible();
  await expect(page.locator('#teamField')).toBeHidden();
  await expect(page.locator('#sideSelect')).toContainText(/Over/);
  await expect(page.locator('#sideSelect')).toContainText(/Under/);

  await expect(page.locator('[data-market="team_total"]')).toBeDisabled();
  await expect(page.locator('[data-market="team_total"]')).toContainText(/disabled until verified team-total source rows/i);
  await expect(page.locator('[data-market="first_half"]')).toBeDisabled();
  await expect(page.locator('[data-market="first_half"]')).toContainText(/disabled until verified period-specific source rows/i);
  await expect(page.locator('[data-market="first_five"]')).toBeDisabled();
  await expect(page.locator('[data-market="first_five"]')).toContainText(/disabled until verified MLB F5 source rows/i);

  await page.selectOption('#sportSelect', 'NBA');
  await expect(page.locator('[data-market="first_five"]')).toBeDisabled();
  await expect(page.locator('[data-market="props"]')).toBeDisabled();

  await page.selectOption('#sportSelect', 'MLB');
  await selectFirstLiveMatchup(page);
  await page.locator('[data-market="total"]').click();
  await page.selectOption('#trendKindSelect', 'full_game_over_under');
  await page.selectOption('#sideSelect', 'over');
  await page.fill('#thresholdInput', '8.5');
  await expect(page.locator('#generateTrend')).toBeEnabled({ timeout: 10000 });
  await page.click('#generateTrend');

  const result = page.locator('#resultsList');
  await expect(result).toContainText(/No strong trend found|No verified trend|Verified source rows|Trend Found/i);
  await expect(result).toContainText(/Full game over \/ under|No verified trend|No strong trend found/i);
  await expect(result).toContainText(/Source classification:\s*(Source-backed|Partial|Blocked|Unsupported|Estimated)|Source-backed/i);
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
    api_source: apiBody.source || null,
    api_trend_count: apiBody.trend_count || 0,
    api_matchup_count: apiBody.matchup_count || 0,
    screenshot: SCREENSHOT_PATH,
  }, null, 2));
});
