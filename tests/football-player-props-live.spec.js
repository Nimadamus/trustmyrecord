// @ts-check
/**
 * FOOTBALL_PROPS_20260909 — the Player Props tab, driven as a user.
 *
 * Walks the real sportsbook for BOTH football leagues and reads what a visitor
 * reads: the tab exists, real players appear, several market categories appear,
 * clicking a price puts the exact player, market, side, line and odds into the
 * pick slip, and the payload that WOULD be submitted carries the metadata the
 * permanent pick record has to keep.
 *
 * It does NOT submit a pick: locking one would write to a real public record.
 * The payload is asserted from the slip's own state instead, which is the same
 * object api.createPick() is handed.
 *
 *   npx playwright test --config=playwright.football-props.config.cjs
 *   SB_URL=http://127.0.0.1:8791/sportsbook/ ...   (a local build)
 */
const { test, expect } = require('@playwright/test');

const SB_URL = process.env.SB_URL || 'https://trustmyrecord.com/sportsbook/';
const LEAGUES = [
  { sport: 'NFL', label: 'NFL' },
  { sport: 'NCAAF', label: 'College Football' },
];

async function openBoard(page, sport) {
  // The board is rendered from a live API on a free-tier host, so a cold or
  // rate-limited call can leave the strip empty. Reload rather than fail: this
  // spec is here to prove the props feature, not to measure Render's latency.
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(SB_URL, { waitUntil: 'domcontentloaded' });
      // Wait for the DEFAULT board first. Clicking the rail before the board's
      // script has bound its handlers is a click into a dead button.
      await expect.poll(async () => page.locator('[data-cat]').count(), { timeout: 60_000 })
        .toBeGreaterThan(1);
      const rail = page.locator(`button.sbn-railbtn[data-sport="${sport}"]`);
      await rail.waitFor({ state: 'visible', timeout: 30_000 });
      await rail.click();
      // Then wait for the strip to be rebuilt for THIS sport.
      await expect.poll(async () => {
        const t = await page.locator('[data-cat]').allInnerTexts().catch(() => []);
        return t.join('|');
      }, { timeout: 60_000 }).toContain('Player Props');
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function openPlayerProps(page) {
  const tab = page.locator('[data-cat]', { hasText: 'Player Props' }).first();
  await expect(tab).toBeVisible({ timeout: 60_000 });
  await tab.click();
  await expect.poll(async () => page.locator('.sbn-striprest, .sbn-norow').count(), { timeout: 60_000 })
    .toBeGreaterThan(0);
}

for (const league of LEAGUES) {
  test.describe(`${league.label} player props`, () => {
    test(`${league.sport}: real props, categories, slip and payload`, async ({ page }) => {
      await openBoard(page, league.sport);

      // 1. the tab exists and is counted off the feed
      const tab = page.locator('[data-cat]', { hasText: 'Player Props' }).first();
      await expect(tab, 'no Player Props tab on the board').toBeVisible({ timeout: 60_000 });
      const tabText = (await tab.innerText()).replace(/\s+/g, ' ');
      const gamesWithProps = Number((tabText.match(/(\d+)\s*$/) || [])[1] || 0);
      expect(gamesWithProps, `Player Props tab counts no games (${tabText})`).toBeGreaterThan(0);

      await openPlayerProps(page);

      // 2. open the first game that actually carries props
      const more = page.locator('.sbn-striprest').first();
      await expect(more, 'no game on this board carries props').toBeVisible({ timeout: 60_000 });
      await more.click();
      await expect(page.locator('.sbn-drawer-panel')).toBeVisible({ timeout: 30_000 });

      // 3. several market categories
      const chips = page.locator('.sbn-dprop');
      await expect.poll(async () => chips.count(), { timeout: 30_000 }).toBeGreaterThan(1);
      const chipLabels = await chips.allInnerTexts();
      expect(chipLabels.length, chipLabels.join(',')).toBeGreaterThanOrEqual(2);

      // 4. real players, not placeholders
      const rows = page.locator('.sbn-drow--prop');
      await expect.poll(async () => rows.count(), { timeout: 30_000 }).toBeGreaterThan(0);
      const firstPlayer = (await rows.first().locator('.sbn-dside').innerText()).split('\n')[0].trim();
      expect(firstPlayer.length, 'player row has no name').toBeGreaterThan(2);
      expect(firstPlayer).not.toMatch(/^(over|under|tbd|player)$/i);

      // 5. click a price and read the slip
      const chip = page.locator('.sbn-drow--prop .sbn-chip[data-pick]').first();
      const raw = await chip.getAttribute('data-pick');
      const payload = JSON.parse(raw);
      await chip.click();

      // 6. the payload the pick record is built from
      expect(payload.marketType, 'market type is not a football prop').toMatch(/^(nfl|ncaaf)_/);
      expect(payload.selection, 'selection lost the player').toMatch(/ (Over|Under)$/);
      const player = payload.selection.replace(/ (Over|Under)$/, '');
      expect(player.length).toBeGreaterThan(2);
      expect(typeof payload.line).toBe('number');
      expect(Math.abs(payload.odds)).toBeGreaterThanOrEqual(100);
      expect(payload.game, 'payload lost the matchup').toContain('@');
      expect(payload.groupLabel, 'payload lost the market name').toBeTruthy();
      expect(payload.snapshot.home_team && payload.snapshot.away_team).toBeTruthy();
      expect(payload.snapshot.commence_time, 'payload lost the kickoff').toBeTruthy();

      // 7. the slip shows sport, matchup, player, market, side, line and odds
      const slip = page.locator('.sbn-slip');
      await expect.poll(async () => (await slip.innerText()).includes(player), { timeout: 20_000 }).toBe(true);
      const slipText = (await slip.innerText()).replace(/\s+/g, ' ');
      expect(slipText, 'slip lost the player').toContain(player);
      expect(slipText, 'slip lost the side and line').toMatch(new RegExp(`${payload.line}`));
      expect(slipText, 'slip lost the matchup').toMatch(/@/);
      expect(slipText.toUpperCase(), 'slip lost the market name')
        .toContain(String(payload.groupLabel).toUpperCase());
      expect(slipText, 'slip shows no price').toMatch(/[+-]\d{3,}|[+-]\d{2,}/);
      // A record that reads only "Over 87.5" is exactly what must not happen.
      expect(slipText).not.toMatch(/^\s*(Over|Under)\s+[\d.]+\s*$/);

      // Housekeeping, not an assertion: the slip is client-side state that is
      // never submitted, so a failure to tidy it must not fail a test whose
      // subject has already been proved above.
      try {
        await page.locator('.sbn-dclose').first().click({ timeout: 5_000 });
        await page.locator('[data-clear]').first().click({ timeout: 5_000 });
      } catch (_e) { /* the drawer animates; nothing here is under test */ }
    });
  });
}

test('a game the book has not priced says so, and says whose choice it was', async ({ page }) => {
  // College is the case that proves it: books post props on the games they
  // expect action on and on nothing else, so most of the slate has none.
  await openBoard(page, 'NCAAF');
  await openPlayerProps(page);
  const empties = page.locator('.sbn-norow', { hasText: 'Player props not currently posted by sportsbook' });
  await expect.poll(async () => empties.count(), { timeout: 60_000 }).toBeGreaterThan(0);
});
