#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const ARTIFACT_DIR = path.join(process.cwd(), 'artifacts');

async function waitForBoardSettled(page) {
  await page.locator('#gamesListContainer').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const board = document.querySelector('#gamesListContainer');
    return board && !/Loading live odds/i.test(board.textContent || '');
  }, null, { timeout: 30000 });
}

function screenshotPath(name) {
  return path.join(ARTIFACT_DIR, name);
}

function importRootScreenshot(out) {
  execFileSync('bash', ['-lc', `import -window root "${out.replace(/\\/g, '/')}"`], { stdio: 'inherit' });
  console.log(`browser proof screenshot: ${out}`);
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1440,1200', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1040 } });
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await waitForBoardSettled(page);

  if (await page.getByRole('button', { name: /^Props$/i }).count()) {
    throw new Error('Props button should not be visible on sportsbook');
  }
  importRootScreenshot(screenshotPath('sportsbook-props-removed-browser-proof.png'));

  await page.locator('[data-sportsbook-tab="sport"][data-sport="NBA"], [data-sport="NBA"]').first().click();
  await waitForBoardSettled(page);
  const cards = page.locator('#gamesListContainer .tmr-market-card');
  await cards.first().waitFor({ state: 'visible', timeout: 30000 });
  const lakersCard = cards.filter({ hasText: /Lakers|Thunder/i }).first();
  const perGameCard = await lakersCard.count() ? lakersCard : cards.nth(1);
  await perGameCard.scrollIntoViewIfNeeded();
  await perGameCard.getByRole('button', { name: /Team Totals/i }).first().click();
  await page.waitForTimeout(500);
  await perGameCard.getByRole('button', { name: /Quarters|Periods|Halves|1H Lines/i }).first().click();
  await page.waitForTimeout(500);
  const marketText = await perGameCard.innerText();
  if (!/Quarters|Periods|Halves|1H Lines|Market unavailable|Unavailable/i.test(marketText)) {
    throw new Error('Per-game market tab did not show prices or a clean unavailable state');
  }
  if (await perGameCard.getByRole('button', { name: /^Props$/i }).count()) {
    throw new Error('Props button should not be visible on per-game card');
  }
  importRootScreenshot(screenshotPath('sportsbook-lakers-market-browser-proof.png'));

  try {
    const primaryGrid = page.locator('.tmr-primary-market-grid, [data-testid="primary-market-grid"]').first();
    await primaryGrid.scrollIntoViewIfNeeded();
    await primaryGrid.locator('button:not([disabled])').first().click();
    await page.locator('#pickOddsInput').fill('-110');
    await page.locator('#ttSlipUnits').fill('3');
    await page.locator('#ttSlipUnits').dispatchEvent('input');
    await page.locator('#ttSlipStakePreview').waitFor({ state: 'visible', timeout: 10000 });
    const preview = page.locator('#ttSlipStakePreview');
    const previewText = await preview.innerText();
    if (!/Risk\s*3\s*units/i.test(previewText) || !/To Win\s*2\.73\s*units/i.test(previewText)) {
      throw new Error(`Units=3 preview did not update correctly: ${previewText}`);
    }
    const visiblePreviewCount = await page.locator('#unitsStakePreview, #ttSlipStakePreview, [data-testid="stake-preview"]').evaluateAll((nodes) => nodes.filter((node) => {
      const style = window.getComputedStyle(node);
      return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' && node.textContent.trim().length > 0;
    }).length);
    if (visiblePreviewCount !== 1) {
      throw new Error(`Risk/To Win preview should render once, found ${visiblePreviewCount}`);
    }
    await page.locator('#pickDetails').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    importRootScreenshot(screenshotPath('sportsbook-units-3-browser-proof.png'));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
