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
  await page.evaluate(() => {
    const mlbButton = Array.from(document.querySelectorAll('[data-sport="MLB"]')).find((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    if (mlbButton) mlbButton.click();
    else window.TMR.setSport('MLB');
  });
  await waitForBoardSettled(page);
  await page.waitForFunction(() => {
    const rows = document.querySelector('#lobbyBoardRows');
    const title = document.querySelector('#boardTitle');
    return rows && rows.getAttribute('data-sport') === 'MLB' && /MLB/i.test((title && title.textContent) || '');
  }, null, { timeout: 15000 });
  await page.evaluate(() => {
    if (window.TMR && typeof window.TMR.setPeriod === 'function') {
      window.TMR.setPeriod('f5');
    } else {
      const f5Button = document.querySelector('#lobbyPeriodBar [data-period="f5"], button[data-market="first_5"]');
      if (f5Button) f5Button.click();
    }
  });
  await page.waitForFunction(() => {
    const rows = document.querySelector('#lobbyBoardRows');
    return rows && rows.getAttribute('data-sport') === 'MLB' && !/Loading/i.test(rows.textContent || '');
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const rows = document.querySelector('#lobbyBoardRows');
    const f5Cards = Array.from(document.querySelectorAll('.sportsbook-game-card--shared-market[data-market-tab="First 5"]'));
    const f5Buttons = f5Cards.flatMap((card) => Array.from(card.querySelectorAll('.sb-odds:not(.is-empty):not([disabled])')));
    return rows && rows.innerText.length > 200 && f5Buttons.length > 0;
  }, null, { timeout: 30000 });

  await page.locator('.sportsbook-game-card--shared-market[data-market-tab="First 5"] .sb-odds:not(.is-empty):not([disabled])').first().click();
  await page.locator('.tmr-slip-panel:visible, #pickDetails:visible, aside:has-text("Pick Slip"):visible').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const board = document.querySelector('#lobbyBoardRows') || document.querySelector('#gamesListContainer') || document.querySelector('main article');
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
