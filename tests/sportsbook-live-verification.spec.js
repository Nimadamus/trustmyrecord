const { test, expect } = require('@playwright/test');
const path = require('path');

const LIVE_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const ARTIFACT_PATH = path.join(process.cwd(), 'artifacts', 'sportsbook-live-verification.png');

async function clickSport(page, sport) {
  const label = sport === 'Soccer' ? /Soccer\b/i : new RegExp(`^${sport}\\b`, 'i');
  const tab = page.getByRole('button', { name: label }).first();
  await expect(tab, `${sport} tab should be present`).toBeVisible({ timeout: 15000 });
  await tab.click();
}

function visibleBoard(page) {
  return page.locator('#lobbyBoardRows:visible, #gamesListContainer:visible, main article:visible').first();
}

async function waitForBoardSettled(page) {
  await expect(visibleBoard(page)).toBeVisible({ timeout: 20000 });
  await expect(page.locator('body')).not.toContainText(/Loading live odds/i, { timeout: 30000 });
}

test('live sportsbook NHL primary markets and pick slip are usable', async ({ page }) => {
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await waitForBoardSettled(page);

  await clickSport(page, 'NHL');
  await waitForBoardSettled(page);

  const cards = page.locator('#lobbyBoardRows article:visible, #gamesListContainer .tmr-market-card:visible, main article:visible');
  await expect(cards.first(), 'at least one NHL game card should render').toBeVisible({ timeout: 30000 });

  const card = cards.first();
  await expect(card, 'card should keep the styled sportsbook card layout').toHaveCSS('display', /block|grid|flex/);
  await expect(card, 'card must not regress into a plain table layout').not.toHaveCSS('display', 'table');
  await expect(card.locator('table'), 'plain table markup should not replace the styled game card').toHaveCount(0);

  const primaryGrid = card;
  await expect(primaryGrid, 'NHL card must expose the main markets directly on the card').toBeVisible({ timeout: 15000 });

  await expect(primaryGrid, 'Moneyline must be visible in the primary grid').toContainText(/Moneyline/i);
  await expect(primaryGrid, 'Spread/Puck Line must be visible in the primary grid').toContainText(/Puck Line|Spread/i);
  await expect(primaryGrid, 'Total must be visible in the primary grid').toContainText(/Total/i);
  await expect
    .poll(async () => card.locator('.tmr-group').evaluateAll((nodes) => nodes.filter((node) => {
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
    }).length), { message: 'duplicate full-width secondary market groups must be hidden by default' })
    .toBe(0);

  const primaryButtons = card
    .locator('button:not([disabled]), [role="button"]:not([aria-disabled="true"])')
    .filter({ hasText: /ML|[+-]\d|O\s*\d|U\s*\d/i });
  await expect(primaryButtons.first(), 'visible market prices should be clickable').toBeVisible({ timeout: 15000 });
  await primaryButtons.first().click();

  const labels = [
    /away.*moneyline|moneyline.*away|ml/i,
    /home.*moneyline|moneyline.*home|ml/i,
    /away.*puck line|puck line.*away|\+|-|1\.5/i,
    /home.*puck line|puck line.*home|\+|-|1\.5/i,
    /over|o\s*\d/i,
    /under|u\s*\d/i,
  ];
  for (const label of labels) {
    await expect(primaryGrid, `primary grid is missing ${label}`).toContainText(label);
  }

  await expect(page.getByRole('tab', { name: /Game Lines/i }).first()).toBeVisible();
  const teamTotals = page.getByRole('tab', { name: /Team Totals/i }).first();
  await expect(teamTotals).toBeVisible();
  await teamTotals.click();
  await waitForBoardSettled(page);
  await expect(visibleBoard(page)).toContainText(/Team Totals|not posted|not offered|temporarily unavailable|Matchup|Total/i);

  const slip = page.locator('#pickDetails, .tmr-slip-panel').first();
  await expect(slip, 'pick slip should be visible').toBeVisible();
  await expect(slip, 'clicking a visible price should show odds in the slip').toContainText(/Odds/i);
  await expect(page.locator('#unitsInput, #ttSlipUnits').first(), 'units input should remain available').toBeVisible();
  await expect(page.locator('#unitsModeToggle, #ttUnitsModeToggle, [data-testid="stake-mode-toggle"]').first(), 'stake mode toggle should remain available').toBeVisible();
  const stakePreview = page.locator('#unitsStakePreview, #ttSlipStakePreview, [data-testid="stake-preview"]').first();
  await expect(stakePreview, 'risk/to win preview should be present').toContainText(/Risk/i);
  await expect(stakePreview, 'risk/to win preview should be present').toContainText(/To Win/i);

  for (const sport of ['NBA', 'MLB', 'NFL', 'NCAAB', 'NCAAF', 'Soccer']) {
    await clickSport(page, sport);
    await waitForBoardSettled(page);
    await expect(visibleBoard(page), `${sport} board should not be blank after tab click`).toContainText(/Markets|No .*games|temporarily unavailable|game|Matchup|Board/i, { timeout: 15000 });
  }

  await clickSport(page, 'NHL');
  await waitForBoardSettled(page);
  await expect(primaryGrid).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: ARTIFACT_PATH, fullPage: true });
});
