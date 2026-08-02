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

// Sport tab label -> the odds-API sport_key the board queries. This proof used
// to hard-code NHL, so it failed every day between the Stanley Cup Final and
// October: there is no NHL slate in the summer, so no cards, no prices, nothing
// to click. That is the calendar, not a regression. Pick whichever sport
// actually has posted lines right now and prove the SAME card/market/pick-slip
// contract against it; if no sport anywhere has a slate, that IS an outage and
// the proof still fails.
const SPORT_KEYS = {
  NHL: 'icehockey_nhl',
  NBA: 'basketball_nba',
  MLB: 'baseball_mlb',
  NFL: 'americanfootball_nfl',
  WNBA: 'basketball_wnba',
};

async function pickSportInSeason(page) {
  const withGames = [];
  for (const [tab, key] of Object.entries(SPORT_KEYS)) {
    const count = await page.evaluate(async (sportKey) => {
      try {
        const base = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl)
          || 'https://trustmyrecord-api.onrender.com/api';
        const res = await fetch(base + '/games/odds/' + sportKey);
        if (!res.ok) return 0;
        const body = await res.json();
        const games = Array.isArray(body) ? body : (body.games || []);
        return games.filter((g) => (g.bookmakers || []).length > 0).length;
      } catch (e) { return 0; }
    }, key);
    if (count > 0) withGames.push({ tab, count });
  }
  expect(
    withGames.length,
    'no sport has a posted slate at all -- the odds feed is down, not merely out of season'
  ).toBeGreaterThan(0);
  return withGames.sort((a, b) => b.count - a.count)[0].tab;
}

test('live sportsbook primary markets and pick slip are usable', async ({ page }) => {
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await waitForBoardSettled(page);

  const sport = await pickSportInSeason(page);
  await clickSport(page, sport);
  await waitForBoardSettled(page);
  // The board container is already on screen (showing the previous sport, or an
  // empty-state panel), so container visibility alone settles instantly and the
  // card assertions below would race the re-render. Wait for the new sport's
  // cards to actually land.
  await expect
    .poll(
      async () => page.locator('#lobbyBoardRows article, #gamesListContainer .tmr-market-card, main article').count(),
      { message: sport + ' game cards should render after switching sports', timeout: 30000 }
    )
    .toBeGreaterThan(0);

  const cards = page.locator('#lobbyBoardRows article:visible, #gamesListContainer .tmr-market-card:visible, main article:visible');
  await expect(cards.first(), sport + ' board should render at least one game card').toBeVisible({ timeout: 30000 });

  const card = cards.first();
  await expect(card, 'card should keep the styled sportsbook card layout').toHaveCSS('display', /block|grid|flex/);
  await expect(card, 'card must not regress into a plain table layout').not.toHaveCSS('display', 'table');
  await expect(card.locator('table'), 'plain table markup should not replace the styled game card').toHaveCount(0);

  const primaryGrid = card;
  await expect(primaryGrid, sport + ' card must expose the main markets directly on the card').toBeVisible({ timeout: 15000 });

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

  const slip = page.locator('.tmr-slip-panel:visible, #pickDetails:visible, aside:has-text("Pick Slip"):visible').first();
  await expect(slip, 'pick slip should be visible').toBeVisible();
  await expect(slip, 'clicking a visible price should show odds in the slip').toContainText(/Odds/i);
  await expect(page.locator('#unitsInput, #ttSlipUnits').first(), 'units input should remain available').toBeVisible();
  await expect(slip, 'stake mode text should remain available').toContainText(/Stake Mode|Risk|To Win/i);
  await expect(slip, 'risk preview should be present').toContainText(/Risk/i);
  await expect(slip, 'to-win preview should be present').toContainText(/To Win/i);

  for (const sport of ['NBA', 'MLB', 'NFL', 'NCAAB', 'NCAAF', 'Soccer']) {
    await clickSport(page, sport);
    await waitForBoardSettled(page);
    await expect(visibleBoard(page), `${sport} board should not be blank after tab click`).toContainText(/Markets|No .*games|temporarily unavailable|game|Matchup|Board/i, { timeout: 15000 });
  }

  // Return to the in-season sport (not a hard-coded NHL, which has no summer
  // slate) and prove the card survives the full tab sweep intact.
  await clickSport(page, sport);
  await waitForBoardSettled(page);
  await expect
    .poll(
      async () => page.locator('#lobbyBoardRows article:visible, #gamesListContainer .tmr-market-card:visible, main article:visible').count(),
      { message: sport + ' cards should return after sweeping every tab', timeout: 30000 }
    )
    .toBeGreaterThan(0);
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: ARTIFACT_PATH, fullPage: true });
});
