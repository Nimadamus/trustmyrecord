#!/usr/bin/env node

const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const ARTIFACT_PATH = path.join(process.cwd(), 'artifacts', 'sportsbook-live-verification.png');

async function expectVisible(locator, message, timeout = 15000) {
  await locator.waitFor({ state: 'visible', timeout });
  assert(await locator.isVisible(), message);
}

async function clickSport(page, sport) {
  const tab = page.locator(`[data-sportsbook-tab="sport"][data-sport="${sport}"], [data-sport="${sport}"]`).first();
  await expectVisible(tab, `${sport} tab should be visible`);
  await tab.click();
}

async function waitForBoardSettled(page) {
  await expectVisible(page.locator('#gamesListContainer'), 'sportsbook board should be visible', 20000);
  await page.waitForFunction(() => {
    const board = document.querySelector('#gamesListContainer');
    return board && !/Loading live odds/i.test(board.textContent || '');
  }, null, { timeout: 30000 });
}

async function main() {
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  page.setDefaultTimeout(15000);

  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await waitForBoardSettled(page);

  await clickSport(page, 'NHL');
  await waitForBoardSettled(page);

  const card = page.locator('#gamesListContainer .tmr-market-card').first();
  await expectVisible(card, 'at least one NHL game card should render', 30000);

  const display = await card.evaluate((node) => getComputedStyle(node).display);
  assert.notStrictEqual(display, 'table', 'card must not regress into a plain table layout');
  assert.strictEqual(await card.locator('table').count(), 0, 'plain table markup should not replace the styled game card');

  const primaryGrid = card.locator('.tmr-primary-market-grid, [data-testid="primary-market-grid"]').first();
  await expectVisible(primaryGrid, 'NHL card must expose the main markets directly on the card');
  const gridText = await primaryGrid.innerText();
  assert(/Moneyline/i.test(gridText), 'Moneyline must be visible in the primary grid');
  assert(/Puck Line/i.test(gridText), 'Puck Line must be visible in the primary grid');
  assert(/Total/i.test(gridText), 'Total must be visible in the primary grid');
  assert(/Over|O\s*\d/i.test(gridText), 'Over total must be visible in the primary grid');
  assert(/Under|U\s*\d/i.test(gridText), 'Under total must be visible in the primary grid');


  const visibleSecondaryGroupsBeforeTab = await card.locator('.tmr-group').evaluateAll((nodes) => nodes.filter((node) => {
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  }).length);
  assert.strictEqual(visibleSecondaryGroupsBeforeTab, 0, 'duplicate full-width secondary market groups must be hidden by default');

  const primaryButtons = primaryGrid.locator('button:not([disabled]), [role="button"]:not([aria-disabled="true"])');
  assert.strictEqual(await primaryButtons.count(), 6, 'six primary prices should be clickable');

  await expectVisible(card.getByRole('button', { name: /Game Lines/i }).first(), 'Game Lines tab should remain visible');
  await expectVisible(card.getByRole('button', { name: /Team Totals/i }).first(), 'Team Totals tab should remain visible');

  const plainDefaultTabs = await card.locator('.tmr-card-filter-tab').evaluateAll((nodes) => nodes.filter((node) => {
    const style = window.getComputedStyle(node);
    const bg = style.backgroundColor;
    const border = style.borderTopColor;
    return style.display !== 'none' && node.getClientRects().length > 0 && (bg === 'rgb(255, 255, 255)' || border === 'rgb(0, 0, 0)');
  }).length);
  assert.strictEqual(plainDefaultTabs, 0, 'plain white default market buttons must not be visible');

  await card.getByRole('button', { name: /Team Totals/i }).first().click();
  const visibleSecondaryGroupsAfterTab = await card.locator('.tmr-group').evaluateAll((nodes) => nodes.filter((node) => {
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  }).length);
  assert(visibleSecondaryGroupsAfterTab > 0, 'secondary markets should reveal compact groups only after a tab click');

  await primaryButtons.first().click();
  const oddsInput = page.locator('#pickOddsInput');
  await expectVisible(oddsInput, 'pick slip odds input should be visible');
  await page.waitForFunction(() => {
    const input = document.querySelector('#pickOddsInput');
    return input && String(input.value || '').trim().length > 0;
  }, null, { timeout: 10000 });
  await expectVisible(page.locator('#unitsInput'), 'units input should remain visible');
  await expectVisible(page.locator('#unitsModeToggle, [data-testid="stake-mode-toggle"]').first(), 'stake mode toggle should remain visible');
  const preview = page.locator('#unitsStakePreview, #ttSlipStakePreview, [data-testid="stake-preview"]').first();
  await expectVisible(preview, 'risk/to win preview should be visible');
  const previewText = await preview.innerText();
  assert(/Risk/i.test(previewText), 'risk preview should include Risk');
  assert(/To Win/i.test(previewText), 'risk preview should include To Win');

  for (const sport of ['NBA', 'MLB', 'NFL', 'NCAAB', 'NCAAF', 'Soccer']) {
    await clickSport(page, sport);
    await waitForBoardSettled(page);
    const text = await page.locator('#gamesListContainer').innerText();
    assert(/Markets|No .*games|temporarily unavailable|game/i.test(text), `${sport} board should not be blank after tab click`);
  }

  await clickSport(page, 'NHL');
  await waitForBoardSettled(page);
  await expectVisible(primaryGrid, 'NHL primary grid should still be visible before screenshot');
  await page.screenshot({ path: ARTIFACT_PATH, fullPage: true });
  await browser.close();

  console.log(`sportsbook live verification passed: ${LIVE_URL}`);
  console.log(`screenshot: ${ARTIFACT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
