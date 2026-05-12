#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const OUT = path.join(process.cwd(), 'artifacts', 'sportsbook-live-browser-proof.png');

async function waitForBoardSettled(page) {
  await page.locator('#gamesListContainer').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const board = document.querySelector('#gamesListContainer');
    return board && !/Loading live odds/i.test(board.textContent || '');
  }, null, { timeout: 30000 });
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1440,1200', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1040 } });
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await waitForBoardSettled(page);
  await page.locator('[data-sportsbook-tab="sport"][data-sport="NHL"], [data-sport="NHL"]').first().click();
  await waitForBoardSettled(page);
  await page.locator('.tmr-primary-market-grid, [data-testid="primary-market-grid"]').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.tmr-primary-market-grid button:not([disabled])').first().click();
  await page.waitForTimeout(1000);

  try {
    execFileSync('bash', ['-lc', `import -window root "${OUT.replace(/\\/g, '/')}"`], { stdio: 'inherit' });
  } finally {
    await browser.close();
  }
  console.log(`browser proof screenshot: ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
