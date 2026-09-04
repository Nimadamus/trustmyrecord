const { test, expect } = require('@playwright/test');
const path = require('path');

const LIVE_URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const ARTIFACT_PATH = path.join(process.cwd(), 'artifacts', 'sportsbook-live-verification.png');

async function clickSport(page, sport) {
  // The sport rail prints an icon before the label ("⚾ MLB"), so anchoring the
  // accessible name at ^ stopped matching. Still an exact-label match: the
  // sport must appear as its own word, so NBA cannot match WNBA.
  const label = sport === 'Soccer' ? /Soccer\b/i : new RegExp(`(^|[^A-Za-z])${sport}\\b`, 'i');
  const tab = page.getByRole('button', { name: label }).first();
  await expect(tab, `${sport} tab should be present`).toBeVisible({ timeout: 15000 });
  await tab.click();
}

// SPORTSBOOK_V2_20260904: production serves the v2 board (#sbnBoard, rows of
// article.sbn-row). Both skins are listed at every hook so this proof asserts
// the same guarantees whichever one answers.
function visibleBoard(page) {
  return page.locator('#sbnBoard:visible, #lobbyBoardRows:visible, #gamesListContainer:visible, main article:visible').first();
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

// How far ahead a game still counts as part of the slate the board renders.
// Wide enough to cover a full day plus late starts, narrow enough to exclude
// a schedule posted weeks in advance.
const SLATE_WINDOW_HOURS = 30;
const SLATE_GRACE_HOURS = 3; // a game that started recently is still on the board

/**
 * Rank the sports by how big a slate they have RIGHT NOW, best first.
 *
 * The previous version counted every game the odds endpoint returned that had
 * any bookmaker attached, which is not the same question as "will the board
 * render cards today". On 2026-08-08 that made this test pick NFL: the
 * endpoint returned 19 NFL games with prices, but the earliest kicked off five
 * days later and the latest in mid-September, so the board correctly showed an
 * empty state and the proof failed on the calendar again -- the exact bug the
 * season-awareness was added to kill, one level down. MLB had 15 games all
 * inside 24 hours and rendered 30 cards.
 *
 * So games are counted only inside the window the board actually shows, and
 * the result is a RANKED LIST rather than a single winner: the caller walks it
 * until a board really renders, so one sport whose slate is posted but not yet
 * on the board cannot fail the run on its own.
 */
async function rankSportsBySlate(page) {
  const ranked = [];
  for (const [tab, key] of Object.entries(SPORT_KEYS)) {
    const counts = await page.evaluate(async ({ sportKey, windowHours, graceHours }) => {
      try {
        const base = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl)
          || 'https://trustmyrecord-api.onrender.com/api';
        const res = await fetch(base + '/games/odds/' + sportKey);
        if (!res.ok) return { imminent: 0, priced: 0 };
        const body = await res.json();
        const games = Array.isArray(body) ? body : (body.games || []);
        const priced = games.filter((g) => (g.bookmakers || []).length > 0);
        const now = Date.now();
        const imminent = priced.filter((g) => {
          const t = new Date(g.commence_time).getTime();
          if (!Number.isFinite(t)) return false;
          return t > now - graceHours * 3600e3 && t < now + windowHours * 3600e3;
        });
        return { imminent: imminent.length, priced: priced.length };
      } catch (e) { return { imminent: 0, priced: 0 }; }
    }, { sportKey: key, windowHours: SLATE_WINDOW_HOURS, graceHours: SLATE_GRACE_HOURS });
    if (counts.imminent > 0) ranked.push({ tab, ...counts });
  }
  ranked.sort((a, b) => b.imminent - a.imminent);

  expect(
    ranked.length,
    `no sport has a slate inside the next ${SLATE_WINDOW_HOURS}h -- the odds feed is down, ` +
    'not merely out of season (a schedule posted weeks ahead does not count: the board only ' +
    'renders games it is showing today)'
  ).toBeGreaterThan(0);
  return ranked.map((r) => r.tab);
}

/**
 * Click through the ranked sports and return the first whose board genuinely
 * renders game cards. Only when every sport with a live slate fails to render
 * is this a real regression -- and then it fails, loudly, naming them all.
 */
async function selectRenderableSport(page, ranked) {
  const tried = [];
  for (const sport of ranked) {
    await clickSport(page, sport);
    await waitForBoardSettled(page);
    // Polled, not counted once. waitForBoardSettled returns as soon as a board
    // container is visible and the body is not saying "Loading live odds" --
    // and the v2 board shows its container before its rows and never prints
    // that phrase, so a single count() read zero rows off a board that was
    // still filling and declared the sport unrenderable (2026-09-04). Wait for
    // the rows the way the assertions further down already do, and only move on
    // to the next ranked sport once this one really has produced nothing.
    const rendered = await page
      .locator('#sbnBoard article, #lobbyBoardRows article, #gamesListContainer .tmr-market-card, main article')
      .first()
      .waitFor({ state: 'visible', timeout: 25000 })
      .then(() => 1)
      .catch(() => 0);
    if (rendered > 0) return sport;
    tried.push(`${sport} (slate posted, board rendered 0 cards)`);
  }
  throw new Error(
    'every sport with a live slate failed to render any card: ' + tried.join(', '));
}

test('live sportsbook primary markets and pick slip are usable', async ({ page }) => {
  // Pin the mainline pick slip.
  //
  // static/js/sportsbook-multislip.js is on a staged rollout: ROLLOUT_PERCENT
  // is 10 and the bucket is `Math.floor(Math.random() * 100)` stored in
  // localStorage. CI starts from a clean profile every run, so roughly one run
  // in ten drew the multislip panel instead -- a different component, with
  // different markup, that this proof's slip assertions were never written
  // against. That is a coin flip inside a deployment gate, and it is why this
  // job failed intermittently with the sportsbook working.
  //
  // `?multislip=0` is the kill switch the module already exposes. The
  // assertions below are still written to hold for either panel, so the pin
  // makes the run deterministic without quietly narrowing what is proved.
  // An explicit ?multislip= in TMR_SPORTSBOOK_URL wins, so either panel can be
  // exercised on demand rather than only the pinned one.
  const url = new URL(LIVE_URL);
  if (!url.searchParams.has('multislip')) url.searchParams.set('multislip', '0');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await waitForBoardSettled(page);

  const ranked = await rankSportsBySlate(page);
  const sport = await selectRenderableSport(page, ranked);
  // selectRenderableSport already proved this sport's board renders, but the
  // board container is shared and re-renders in place, so re-settle and
  // re-assert before the card assertions below read from it.
  await waitForBoardSettled(page);
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

  // The guarantee is that a reader sees all three primary markets on the board
  // without opening anything. WHERE the names are printed changed with the v2
  // board: the compact row (article.sbn-row) carries only prices, and the market
  // names are printed once in the column header above the rows
  // (div.sbn-colhead: "Run Line | Total | Moneyline"). Asserting them against
  // the card alone therefore failed on a board that is in fact correct
  // (2026-09-04). Assert them against the board that contains the card, which
  // covers the v2 column header and the classic card equally.
  const boardScope = page.locator('#sbnBoard:visible, #lobbyBoardRows:visible, #gamesListContainer:visible').first();
  const marketNames = (await boardScope.count()) ? boardScope : primaryGrid;
  await expect(marketNames, 'Moneyline must be named on the board').toContainText(/Moneyline|\bML\b/i);
  await expect(marketNames, 'Spread/Run Line/Puck Line must be named on the board').toContainText(/Puck Line|Run Line|Spread/i);
  await expect(marketNames, 'Total must be named on the board').toContainText(/Total/i);
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

  // What this has always been for: the card prices BOTH sides of all three
  // primary markets, on the card, with nothing to open first. It used to check
  // that by looking for the market NAMES in the cell text ("ml", "puck line").
  // The v2 row prints the price and nothing else — the names moved to the
  // column header, asserted above — so name-matching failed on a board that
  // was pricing all six cells correctly (2026-09-04). Count the priced cells
  // instead, which is the thing the reader needs and is true of both boards.
  await expect
    .poll(async () => primaryButtons.count(),
      { message: 'the card must price both sides of all three primary markets' })
    .toBeGreaterThanOrEqual(6);
  await expect(primaryGrid, 'the total must be priced Over').toContainText(/over|o\s*\d/i);
  await expect(primaryGrid, 'the total must be priced Under').toContainText(/under|u\s*\d/i);
  await expect(primaryGrid, 'a handicap line must be posted').toContainText(/[+-]\d+(\.\d+)?/);

  // The classic board's market switcher was a tablist; the v2 board renders the
  // same switcher as button.sbn-cat with no role, so a role=tab lookup found
  // nothing on a switcher that works. Take either implementation - what is
  // locked is that the market can be selected, not the element used for it.
  const marketTab = (name) => page
    .locator('[role="tab"], button.sbn-cat, .sportsbook-market-tab')
    .filter({ hasText: name })
    .first();
  await expect(marketTab(/Game Lines/i)).toBeVisible();
  const teamTotals = marketTab(/Team Totals/i);
  await expect(teamTotals).toBeVisible();
  await teamTotals.click();
  await waitForBoardSettled(page);
  await expect(visibleBoard(page)).toContainText(/Team Totals|not posted|not offered|temporarily unavailable|Matchup|Total/i);

  const slip = page.locator(
    '.sbn-sliplist:visible, .tmr-slip-panel:visible, #pickDetails:visible, '
    + 'aside:has-text("Pick Slip"):visible').first();
  await expect(slip, 'pick slip should be visible').toBeVisible();
  // The point is that the clicked PRICE reached the slip, not that a particular
  // label is used for it. The mainline slip writes "Odds"; the multislip panel
  // renders the same number in a .tmr-ms-odds span with no such label. Accept
  // either, so this keeps working whichever panel is served.
  await expect(slip, 'clicking a visible price should carry that price into the slip')
    .toContainText(/Odds|[+-]\d{2,4}/i);
  await expect(
    page.locator('#unitsInput, #ttSlipUnits, .tmr-ms-units-row input, [id^="msUnits"], '
      + '.sbn-slipunits input[type="number"]').first(),
    'units input should remain available'
  ).toBeVisible();
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
