/**
 * Post-deploy verification for TMR Match against the REAL site and API.
 *
 * Read only, and deliberately so. It posts no offer, fills nothing, cancels nothing and moves
 * no TMR: a market that members can see must not carry orders a test invented. Every write path
 * is verified by confirming it is REFUSED to an anonymous caller, which proves the permission
 * boundary without creating the side effect.
 *
 * Partial fills, cancellations, matched positions and the reservation accounting need a real
 * stake to exercise, and they are covered against a real database in the backend suites
 * (tmr-match-test.js, tmr-match-http-test.js) and in the local Playwright run. Recreating them
 * here would mean manufacturing production activity.
 *
 *   npx playwright test --config=playwright.match-live.config.cjs
 */

const { test, expect } = require('@playwright/test');

const API = 'https://trustmyrecord-api.onrender.com/api';

test.describe('TMR Match, live', () => {
  test('the market page loads and is indexable', async ({ page }) => {
    const res = await page.goto('/tmr-match/');
    expect(res.status()).toBe(200);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('index');
    expect(robots).not.toContain('noindex');
    await expect(page.locator('link[rel="canonical"]'))
      .toHaveAttribute('href', 'https://trustmyrecord.com/tmr-match/');
  });

  test('the page renders on a phone as well as a desktop', async ({ page }) => {
    await page.goto('/tmr-match/');
    await expect(page.locator('h1')).toBeVisible();
    // Nothing may push the document wider than the viewport. A market table that forces a
    // sideways scroll of the whole page is unusable on the device most people will open it on.
    for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at ${w}px`).toBeLessThanOrEqual(1);
    }
  });

  test('the order book is public and the member half is not', async ({ request }) => {
    for (const path of ['/tmr-match/meta', '/tmr-match/offers', '/tmr-match/depth']) {
      const r = await request.get(API + path);
      expect(r.status(), `${path} is the public book and must serve`).toBe(200);
    }
    for (const path of ['/tmr-match/mine', '/tmr-match/fills']) {
      const r = await request.get(API + path);
      expect(r.status(), `${path} is member data and must require a token`).toBe(401);
    }
  });

  test('the public book exposes no member-private detail', async ({ request }) => {
    const r = await request.get(`${API}/tmr-match/offers`);
    const body = await r.json();
    const text = JSON.stringify(body);
    // A resting order reveals a price and a size. It must not reveal the maker's reservation,
    // their balance, or anything about the wallet behind it.
    for (const leak of ['reservation', 'balance', 'wallet', 'idempotency']) {
      expect(text.toLowerCase(), `the public book must not carry ${leak}`).not.toContain(leak);
    }
  });

  test('anonymous visitors cannot post, take or cancel anything', async ({ request }) => {
    const writes = [
      ['/tmr-match', { side: 'for', price_american: -110, quantity: 10 }],
      ['/tmr-match/1/take', { quantity: 10 }],
      ['/tmr-match/1/cancel', {}],
    ];
    for (const [path, body] of writes) {
      const r = await request.post(API + path, { data: body });
      expect(r.status(), `${path} must be refused`).toBe(401);
    }
  });

  test('the posting rules come from the service, not from page copy', async ({ request }) => {
    const r = await request.get(`${API}/tmr-match/meta`);
    expect(r.status()).toBe(200);
    const meta = await r.json();
    // The page builds its form from these. If they were hardcoded in script they would drift
    // the moment the service changed a limit, and a member would be told a rule that is not
    // enforced -- or refused one that is.
    expect(Number(meta.min_quantity)).toBeGreaterThan(0);
    expect(Array.isArray(meta.sides) ? meta.sides : Object.keys(meta.sides || {})).toContain('for');
    // Rake stays off. If this ever reports otherwise, the market started charging.
    if ('rake_bps' in meta) expect(Number(meta.rake_bps)).toBe(0);
  });

  test('signed out, the page asks for a sign in rather than showing an empty market',
    async ({ page }) => {
      await page.goto('/tmr-match/');
      const body = (await page.locator('body').innerText()).toLowerCase();
      expect(body).toMatch(/sign in|log in|sign-in/);
    });

  test('Match and Challenge are both reachable from the nav', async ({ page }) => {
    await page.goto('/leaderboards/');
    const match = page.locator('a[href="/tmr-match/"]');
    const challenge = page.locator('a[href="/tmr-challenges/"]');
    await expect(match).toHaveCount(1, { timeout: 30000 });
    await expect(challenge).toHaveCount(1);
    // The older challenge system keeps its entry too. Three coexisting entries is the intended
    // state until the TMR ones have live evidence behind them.
    await expect(page.locator('a[href="/challenges/"]').first()).toBeAttached();

    await page.getByRole('button', { name: /Compete/i }).first().click();
    await expect(match).toBeVisible();
    await match.click();
    await page.waitForURL('**/tmr-match/**');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('no regression: the Challenge hub, profiles, Earn and the old challenges still serve',
    async ({ page, request }) => {
      expect((await request.get(`${API}/challenges/open`)).status()).toBe(200);
      expect((await request.get(`${API}/tmr-challenges/stats/by-username/BetLegend`)).status()).toBe(200);
      for (const path of ['/tmr-challenges/', '/u/BetLegend/', '/wallet/earn/', '/forum/']) {
        const res = await page.goto(path);
        expect(res.status(), `${path} must still serve`).toBe(200);
      }
    });
});
