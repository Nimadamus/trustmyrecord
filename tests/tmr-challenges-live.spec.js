/**
 * Post-deploy verification against the REAL trustmyrecord.com and the REAL API.
 *
 * Read only, and deliberately so. It creates no challenge, no user and no TMR movement: the
 * whole point is to confirm the deployment without leaving anything behind on a live site that
 * members can see. Every write path is verified by confirming it is REFUSED -- an anonymous
 * visitor cannot create, accept, settle or dispute anything -- which proves the permission
 * boundary without exercising the side effect.
 *
 * The rules that need a real stake to exercise (immutable terms after acceptance, insufficient
 * balance, self-challenge, a dispute blocking settlement) are proven against a real database in
 * tests/tmr-challenges.spec.js and the backend suites. Manufacturing them here would mean
 * creating fake public challenges, which is exactly what must not happen.
 *
 *   npx playwright test --config=playwright.challenges-live.config.cjs
 */

const { test, expect } = require('@playwright/test');

const API = 'https://trustmyrecord-api.onrender.com/api';

test.describe('TMR Challenge, live', () => {
  test('the Challenge Hub loads and asks an anonymous visitor to sign in', async ({ page }) => {
    const res = await page.goto('/tmr-challenges/');
    expect(res.status()).toBe(200);
    await expect(page).toHaveTitle(/TMR Challenges/);
    await expect(page.locator('h1')).toHaveText('TMR Challenges');
    // Signed out, the page must offer a way in and must not render a hub full of empty tabs.
    await expect(page.locator('#signedOut')).toBeVisible();
    await expect(page.locator('#chBody')).toBeHidden();
    await expect(page.locator('#errState')).toBeHidden();
  });

  test('the page is indexable and self-canonical, and says what it is', async ({ page }) => {
    await page.goto('/tmr-challenges/');
    await expect(page.locator('link[rel="canonical"]'))
      .toHaveAttribute('href', 'https://trustmyrecord.com/tmr-challenges/');
    // Never noindex anything.
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('index');
    expect(robots).not.toContain('noindex');
    await expect(page.locator('.ch-subtitle')).toContainText('There is no rake');
  });

  test('every hub surface is present in the deployed markup', async ({ page }) => {
    await page.goto('/tmr-challenges/');
    for (const tab of ['open', 'incoming', 'active', 'completed', 'create']) {
      await expect(page.locator(`.tab[data-tab="${tab}"]`)).toHaveCount(1);
      await expect(page.locator(`#panel-${tab}`)).toHaveCount(1);
    }
    for (const id of ['createForm', 'fFormat', 'fStake', 'fOpponent', 'fExpires', 'fTerms',
      'detail', 'dCard', 'dHistory', 'balVal', 'recVal', 'netVal', 'escVal']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
  });

  test('a challenge detail URL serves the page rather than erroring', async ({ page }) => {
    const res = await page.goto('/tmr-challenges/?id=1');
    expect(res.status()).toBe(200);
    await expect(page.locator('#signedOut')).toBeVisible();
  });

  test('the API is mounted and refuses anonymous reads of member data', async ({ request }) => {
    for (const path of ['/tmr-challenges/meta', '/tmr-challenges/open', '/tmr-challenges/mine',
      '/tmr-challenges/incoming', '/tmr-challenges/stats']) {
      const r = await request.get(API + path);
      expect(r.status(), `${path} must require auth, and must not 404`).toBe(401);
    }
  });

  test('anonymous visitors cannot write anything at all', async ({ request }) => {
    const writes = [
      ['post', '/tmr-challenges', { format: 'multi_pick', stake: 10 }],
      ['post', '/tmr-challenges/1/accept', {}],
      ['post', '/tmr-challenges/1/decline', {}],
      ['post', '/tmr-challenges/1/cancel', {}],
      ['post', '/tmr-challenges/1/dispute', { reason: 'no' }],
      ['post', '/tmr-challenges/1/settle', { outcome: 'challenger' }],
      ['post', '/tmr-challenges/1/awaiting-settlement', {}],
      ['post', '/tmr-challenges/1/resolve-dispute', {}],
      ['post', '/tmr-challenges/expire-overdue', {}],
    ];
    for (const [, path, body] of writes) {
      const r = await request.post(API + path, { data: body });
      expect(r.status(), `${path} must be refused`).toBe(401);
    }
  });

  test('the public head to head record is readable and internally consistent', async ({ request }) => {
    const r = await request.get(`${API}/tmr-challenges/stats/by-username/BetLegend`);
    expect(r.status()).toBe(200);
    const s = await r.json();

    // Aggregates only. A profile must not be able to leak somebody's terms or opponents.
    for (const leak of ['challenges', 'terms', 'legs', 'opponent_id', 'dispute_reason']) {
      expect(s, `the public record must not carry ${leak}`).not.toHaveProperty(leak);
    }
    expect(s.record).toBe(`${s.wins}-${s.losses}` + (s.pushes ? `-${s.pushes}` : ''));
    expect(s.tmr_won).toBeGreaterThanOrEqual(0);
    expect(s.tmr_lost).toBeGreaterThanOrEqual(0);
    expect(s.tmr_net).toBe(s.tmr_won - s.tmr_lost);
    // The accounting identity, live: realised profit minus what is still escrowed is exactly
    // what the ledger has moved for this member.
    expect(s.ledger_net).toBe(s.tmr_net - s.tmr_in_escrow);

    const missing = await request.get(`${API}/tmr-challenges/stats/by-username/definitely_not_a_member_9f2a`);
    expect(missing.status()).toBe(404);
  });

  test('a profile with no challenge activity shows no zero-filled clutter', async ({ page }) => {
    await page.goto('/u/BetLegend/');
    // The section must exist in the deployed markup and must stay hidden while the member has
    // no challenges, rather than rendering a row of dashes that reads as a dead feature.
    const section = page.locator('#tmrxChallengeSection');
    await expect(section).toHaveCount(1, { timeout: 45000 });
    await expect(section).toBeHidden();

    // toContainText reads textContent, which includes hidden nodes, so it cannot tell a hidden
    // section from a visible one. Assert on visibility instead: neither the heading nor any
    // stat cell may be on screen, and the section must occupy no space -- a `.tmrx-section`
    // rule setting an explicit `display` would override the `hidden` attribute and put a row of
    // dashes on every profile, which is the exact clutter this guards against.
    await expect(page.getByText('Head to Head Challenges')).toBeHidden();
    for (const id of ['tmrxChRecord', 'tmrxChWon', 'tmrxChLost', 'tmrxChNet',
      'tmrxChActive', 'tmrxChCompleted']) {
      await expect(page.locator(`#${id}`)).toBeHidden();
    }
    expect(await section.boundingBox(), 'a hidden section must take up no space').toBeNull();
  });

  test('the hub is reachable from the sitewide nav, without displacing the old one',
    async ({ page }) => {
      await page.goto('/leaderboards/');
      // The nav is rendered by tmr-ds-nav.js, which is on the content-hashed filename system.
      // Editing the source alone ships nothing, so this asserts what a visitor actually gets:
      // a link in the nav, on a page that has nothing to do with challenges.
      const link = page.locator('a[href="/tmr-challenges/"]');
      await expect(link).toHaveCount(1, { timeout: 30000 });
      await expect(link).toHaveText('TMR Challenges');

      // The older challenge system keeps its own entry. Both run side by side, so a nav change
      // that quietly retired the working feature would be a regression, not a cleanup.
      await expect(page.locator('a[href="/challenges/"]').first()).toBeAttached();

      // It lives inside the Compete dropdown as a menuitem, so it is correctly not visible
      // until that menu is opened. Open it the way a visitor does, then follow it -- clicking
      // blind would only prove the markup exists, not that anybody can get there.
      await expect(link).toHaveAttribute('role', 'menuitem');
      await page.getByRole('button', { name: /Compete/i }).first().click();
      await expect(link).toBeVisible();
      await link.click();
      await page.waitForURL('**/tmr-challenges/**');
      await expect(page.locator('h1')).toHaveText('TMR Challenges');
    });

  test('no regression: profiles, picks, Earn, contests and the existing challenges still serve',
    async ({ page, request }) => {
      // The live challenge system keeps its own API and must be untouched by the new namespace.
      expect((await request.get(`${API}/challenges/open`)).status()).toBe(200);

      for (const path of ['/u/BetLegend/', '/wallet/earn/', '/leaderboard/', '/forum/']) {
        const res = await page.goto(path);
        expect(res.status(), `${path} must still serve`).toBe(200);
      }

      // A real profile still renders its verified record, and that record is the handicapping
      // one, not the challenge one.
      await page.goto('/u/BetLegend/');
      await expect(page.locator('#profileAdvRecordSub')).toContainText('Verified', { timeout: 45000 });
    });
});
