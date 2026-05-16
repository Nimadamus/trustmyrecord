#!/usr/bin/env node

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const OUT = path.join(process.cwd(), 'artifacts', 'sportsbook-live-browser-proof.png');

async function waitForBoardSettled(page) {
  await page.locator('#lobbyBoardRows:visible, #gamesListContainer:visible, main article:visible').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const board = document.querySelector('#lobbyBoardRows') || document.querySelector('#gamesListContainer') || document.querySelector('main article');
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
  await page.waitForFunction(() => window.TMR && typeof window.TMR.setSport === 'function', null, { timeout: 15000 });
  await page.evaluate(() => window.TMR.setSport('MLB'));
  await waitForBoardSettled(page);
  await page.waitForFunction(() => /MLB|Baseball/i.test(document.querySelector('#selectedSportTitle, .tmr-board-title, main')?.textContent || document.body.innerText), null, { timeout: 15000 });

  const f5Tab = page.locator('.tmr-board-filter-tab[data-filter="first-5"], .tmr-card-filter-tab[data-filter="first-5"]').first();
  await f5Tab.waitFor({ state: 'visible', timeout: 30000 });
  await f5Tab.click();
  await page.waitForTimeout(1000);

  await page.waitForFunction(() => {
    const card = document.querySelector('.tmr-market-card[data-market-filter="first-5"]');
    return card && card.dataset.scope === 'f5' && card.querySelector('.tmr-group[data-category="first-5"] .tmr-option-btn:not([disabled])');
  }, null, { timeout: 30000 });

  const f5Button = page.locator('.tmr-market-card[data-market-filter="first-5"] .tmr-group[data-category="first-5"] .tmr-option-btn:not([disabled])').first();
  await f5Button.click();
  await page.locator('.tmr-slip-panel:visible, #pickDetails:visible, aside:has-text("Pick Slip"):visible').first().waitFor({ state: 'visible', timeout: 15000 });

  await page.waitForFunction(() => {
    const board = document.querySelector('#gamesListContainer') || document.querySelector('#lobbyBoardRows') || document.querySelector('main article');
    const slip = document.querySelector('.sportsbook-ticket-preview, .tmr-slip-panel, #pickDetails, aside');
    return board && board.innerText.length > 200 && /F5|First 5/i.test((slip && slip.innerText) || '');
  }, null, { timeout: 15000 });
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
