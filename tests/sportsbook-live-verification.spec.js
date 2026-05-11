const { test, expect } = require('@playwright/test');
const path = require('path');

const LIVE_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const ARTIFACT_PATH = path.join(process.cwd(), 'artifacts', 'sportsbook-live-verification.png');

async function clickSport(page, sport) {
  const tab = page.locator(`[data-sportsbook-tab="sport"][data-sport="${sport}"], [data-sport="${sport}"]`).first();
  await expect(tab, `${sport} tab should be present`).toBeVisible({ timeout: 15000 });
  await tab.click();
}

async function waitForBoardSettled(page) {
  await expect(page.locator('#gamesListContainer')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#gamesListContainer')).not.toContainText(/Loading live odds/i, { timeout: 30000 });
}

test('live sportsbook NHL primary markets and pick slip are usable', async ({ page }) => {
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await waitForBoardSettled(page);
  await expect(page.locator('.tmr-global-nav'), 'global TrustMyRecord nav should be visible above sportsbook content').toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('link', { name: /Click Here to See Pending Picks/i }), 'pending picks link text should replace old pick history label').toHaveAttribute('href', /\/my-pending-picks\//);
  await expect(page.getByText(/Open Pick History/i)).toHaveCount(0);
  await expect.poll(async () => page.getByRole('link', { name: /Click Here to See Pending Picks/i }).first().evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth;
  }), { message: 'pending picks link should not be clipped' }).toBe(true);

  await clickSport(page, 'NHL');
  await waitForBoardSettled(page);

  const cards = page.locator('#gamesListContainer .tmr-market-card');
  await expect(cards.first(), 'at least one NHL game card should render').toBeVisible({ timeout: 30000 });

  const card = cards.first();
  await expect(card, 'card should keep the styled sportsbook card layout').toHaveCSS('display', /block|grid|flex/);
  await expect(card, 'card must not regress into a plain table layout').not.toHaveCSS('display', 'table');
  await expect(card.locator('table'), 'plain table markup should not replace the styled game card').toHaveCount(0);

  const primaryGrid = card.locator('.tmr-primary-market-grid, [data-testid="primary-market-grid"]').first();
  await expect(primaryGrid, 'NHL card must expose the main markets directly on the card').toBeVisible({ timeout: 15000 });

  await expect(primaryGrid, 'Moneyline must be visible in the primary grid').toContainText(/Moneyline/i);
  await expect(primaryGrid, 'Puck Line must be visible in the primary grid').toContainText(/Puck Line/i);
  await expect(primaryGrid, 'NHL and MLB use line-moneyline-total column order').toHaveAttribute('data-column-order', 'line-moneyline-total');
  await expect(primaryGrid, 'Total must be visible in the primary grid').toContainText(/Total/i);
  await expect(primaryGrid, 'generic spread labels must not appear in the primary grid').not.toContainText(/Away\s+(Spread|Run Line|Puck Line)|Home\s+(Spread|Run Line|Puck Line)/i);
  await expect(primaryGrid, 'spread/run-line/puck-line cells must show actual line values').toContainText(/[+-]\d+(?:\.\d+)?/);
  await expect(primaryGrid, 'generic moneyline labels must not clutter the primary grid').not.toContainText(/Away\s+Money|Home\s+Money/i);
  await expect(primaryGrid, 'primary odds tiles must not show clipped book/team detail text').not.toContainText(/D\.\.\.|[A-Z]\.\.\./);
  await expect.poll(async () => card.evaluate((node) => {
    const matchup = node.querySelector('.tmr-market-matchup');
    const grid = node.querySelector('.tmr-primary-market-grid');
    if (!matchup || !grid) return false;
    const a = matchup.getBoundingClientRect();
    const b = grid.getBoundingClientRect();
    return b.left >= a.right + 8 || b.top >= a.bottom + 8;
  }), { message: 'primary grid must not overlap the team matchup column' }).toBe(true);
  await expect.poll(async () => card.evaluate((node) => {
    const matchup = node.querySelector('.tmr-market-matchup');
    const grid = node.querySelector('.tmr-primary-market-grid');
    if (!matchup || !grid) return false;
    const a = matchup.getBoundingClientRect();
    const b = grid.getBoundingClientRect();
    return b.left > a.left && b.top < a.bottom;
  }), { message: 'primary grid should sit to the right of the team matchup on desktop, not below it' }).toBe(true);
  await expect(primaryGrid.locator('.tmr-option-detail').first(), 'primary detail text should be hidden to prevent clipped labels').not.toBeVisible();


  await expect
    .poll(
      async () => card.locator('.tmr-group').evaluateAll((nodes) => nodes.filter((node) => {
        const style = window.getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
      }).length),
      { message: 'duplicate full-width secondary market groups must be hidden by default' }
    )
    .toBe(0);

  const primaryButtons = primaryGrid.locator('button:not([disabled]), [role="button"]:not([aria-disabled="true"])');
  await expect(primaryButtons, 'away/home moneyline, puck line, and total prices should all be clickable').toHaveCount(6, { timeout: 15000 });

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

  await expect(card.getByRole('button', { name: /Game Lines/i }).first()).toBeVisible();
  await expect(card.getByRole('button', { name: /Team Totals/i }).first()).toBeVisible();

  await expect
    .poll(
      async () => card.locator('.tmr-card-filter-tab').evaluateAll((nodes) => nodes.filter((node) => {
        const style = window.getComputedStyle(node);
        const bg = style.backgroundColor;
        const border = style.borderTopColor;
        return style.display !== 'none' && node.getClientRects().length > 0 && (bg === 'rgb(255, 255, 255)' || border === 'rgb(0, 0, 0)');
      }).length),
      { message: 'plain white default market buttons must not be visible' }
    )
    .toBe(0);

  await card.getByRole('button', { name: /Team Totals/i }).first().click();
  await expect
    .poll(async () => card.locator('.tmr-group').evaluateAll((nodes) => nodes.filter((node) => {
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
    }).length), { message: 'secondary markets should reveal compact groups only after a tab click' })
    .toBeGreaterThan(0);

  await primaryButtons.first().click();
  await expect.poll(async () => primaryGrid.locator('button:not([disabled])').evaluateAll((buttons) => {
    const heights = buttons.map((button) => Math.round(button.getBoundingClientRect().height));
    return Math.max(...heights) - Math.min(...heights);
  }), { message: 'primary odds buttons should keep uniform dimensions after selection' }).toBeLessThanOrEqual(1);
  await expect(primaryGrid, 'selected state should not add a visible selected badge inside primary odds cells').not.toContainText(/selected/i);

  const slip = page.locator('#pickDetails, .tmr-slip-panel').first();
  await expect(slip, 'pick slip should be visible').toBeVisible();
  await expect.poll(async () => slip.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth;
  }), { message: 'pick slip should not be cut off horizontally at the tested viewport' }).toBe(true);
  await expect(page.locator('#pickOddsInput'), 'clicking a visible price should fill odds').not.toHaveValue('', { timeout: 10000 });
  await expect(page.locator('#ttSlipUnits'), 'single visible units input should remain available').toBeVisible();
  await expect(page.locator('#unitsInput'), 'internal units input should be hidden to avoid duplicate visible unit boxes').not.toBeVisible();
  await expect(page.locator('#unitsModeToggle, [data-testid="stake-mode-toggle"]').first(), 'stake mode toggle should remain available').toBeVisible();
  const stakePreview = page.locator('#unitsStakePreview, #ttSlipStakePreview, [data-testid="stake-preview"]').first();
  await expect(stakePreview, 'risk/to win preview should be present').toContainText(/Risk/i);
  await expect(stakePreview, 'risk/to win preview should be present').toContainText(/To Win/i);
  await expect(stakePreview, 'risk/to win preview should not be stale').not.toContainText(/updates after odds are entered/i);
  await expect(stakePreview, 'risk/to win preview should show calculated unit values').toContainText(/unit/i);

  for (const sport of ['NBA', 'MLB', 'NFL', 'NCAAB', 'NCAAF', 'Soccer']) {
    await clickSport(page, sport);
    await waitForBoardSettled(page);
    await expect(page.locator('#gamesListContainer'), `${sport} board should not be blank after tab click`).toContainText(/Markets|No .*games|temporarily unavailable|game/i, { timeout: 15000 });
  }

  await clickSport(page, 'NHL');
  await waitForBoardSettled(page);
  await expect(primaryGrid).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: ARTIFACT_PATH, fullPage: true });
});
