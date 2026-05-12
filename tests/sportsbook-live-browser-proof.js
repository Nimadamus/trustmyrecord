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
  await page.getByRole('button', { name: /^NHL\b/i }).first().click();
  await waitForBoardSettled(page);
  const boardButton = page
    .locator('#lobbyBoardRows button:not([disabled]), #gamesListContainer button:not([disabled]), main article button:not([disabled])')
    .filter({ hasText: /ML|[+-]\d|O\s*\d|U\s*\d/i })
    .first();
  await boardButton.waitFor({ state: 'visible', timeout: 15000 });
  await boardButton.click();
  await page.locator('.tmr-slip-panel:visible, #pickDetails:visible, aside:has-text("Pick Slip"):visible').first().waitFor({ state: 'visible', timeout: 15000 });
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
