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
  await page.waitForFunction(() => typeof window.__tmrSelectSportBoard === 'function' && typeof window.tmrSetBoardFilter === 'function', null, { timeout: 30000 });
  await page.evaluate(async () => {
    await window.__tmrSelectSportBoard('MLB');
  });
  await page.locator('#gamesListContainer .tmr-market-card').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const title = document.querySelector('#selectedSportTitle');
    const board = document.querySelector('#gamesListContainer');
    const f5Tab = document.querySelector('.tmr-board-filter-tab[data-filter="first-5"]:not([disabled])');
    return board && board.innerText.length > 200 && /MLB/i.test((title && title.textContent) || '') && f5Tab;
  }, null, { timeout: 15000 });
  await page.evaluate(() => {
    window.tmrSetBoardFilter('first-5');
  });
  await page.waitForFunction(() => {
    const board = document.querySelector('#gamesListContainer');
    const card = document.querySelector('#gamesListContainer .tmr-market-card[data-market-filter="first-5"]');
    const f5Button = card && card.querySelector('.tmr-group[data-category="first-5"] .tmr-option-btn:not([disabled])');
    return board && board.innerText.length > 200 && card && card.dataset.scope === 'f5' && f5Button;
  }, null, { timeout: 30000 });

  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('#gamesListContainer .tmr-market-card[data-market-filter="first-5"]')).find((candidate) => (
      candidate.dataset.scope === 'f5' &&
      candidate.querySelector('.tmr-group[data-category="first-5"] .tmr-option-btn:not([disabled])')
    ));
    if (!card) throw new Error('No live F5 card found');
    card.classList.add('open');
    card.classList.add('secondary-open');
    card.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const button = document.querySelector('#gamesListContainer .tmr-market-card.open.secondary-open[data-market-filter="first-5"] .tmr-group[data-category="first-5"] .tmr-option-btn:not([disabled])');
    if (!button) throw new Error('No visible F5 option found');
    button.click();
  });
  await page.locator('.tmr-slip-panel:visible, #pickDetails:visible, aside:has-text("Pick Slip"):visible').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const board = document.querySelector('#gamesListContainer') || document.querySelector('main article');
    const ticketCard = document.querySelector('.sportsbook-ticket-preview-card');
    const summaryPick = document.getElementById('summaryPick');
    const selected = window.TMR && window.TMR.currentSelectedPick;
    const selectedText = JSON.stringify(selected || {});
    const ticketText = ((ticketCard && ticketCard.innerText) || '') + ' ' + ((summaryPick && summaryPick.innerText) || '');
    return board && board.innerText.length > 200
      && selected && /^f5/i.test(String(selected.marketType || selected.market_type || selected.betType || ''))
      && /F5|First 5/i.test(ticketText + ' ' + selectedText);
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
