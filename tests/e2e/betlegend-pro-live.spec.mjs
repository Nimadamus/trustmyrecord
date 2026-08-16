import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * BetLegend Pro against PRODUCTION.
 *
 * Four personas, in the order a real account meets them: a new visitor, a free
 * TrustMyRecord member, a subscriber, and a bettor building a specific
 * situation. Everything asserted here is a property of the live system, not of
 * a stub -- which is the point, and also why it is a separate suite from
 * `betlegend-pro.spec.mjs`.
 *
 * Skips (does not fail) without credentials, so a fork or an unprivileged CI
 * run does not go red for lacking secrets:
 *
 *   BLP_LIVE_SUB_USER  / BLP_LIVE_SUB_PASS    an entitled account
 *   BLP_LIVE_FREE_USER / BLP_LIVE_FREE_PASS   a non-entitled, non-test account
 *
 * A free account has ONE report a day, so the free-persona test asserts the
 * gating and the messaging rather than spending it.
 */
const SITE = process.env.BLP_LIVE_SITE || 'https://trustmyrecord.com';
const API = process.env.BLP_LIVE_API || 'https://trustmyrecord-api.onrender.com';

const SUB = { user: process.env.BLP_LIVE_SUB_USER, pass: process.env.BLP_LIVE_SUB_PASS };
const FREE = { user: process.env.BLP_LIVE_FREE_USER, pass: process.env.BLP_LIVE_FREE_PASS };

// The engine sleeps on a free instance; a cold start is measured at 28-53s and
// a report on top of it needs its own budget.
test.setTimeout(180000);

async function login(page, creds) {
  await page.goto(`${SITE}/login/?next=/betlegend-pro/app/`);
  await page.locator('input[type=text]').first().fill(creds.user);
  await page.locator('input[type=password]').first().fill(creds.pass);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL(/betlegend-pro\/app/, { timeout: 60000 });
  await expect(page.locator('#app')).toBeVisible({ timeout: 60000 });
}

async function runReport(page, { away, home, sport = 'MLB' }) {
  await page.locator('#mSport').selectOption(sport);
  await expect(page.locator(`#mAway option[value="${away}"]`)).toHaveCount(1, { timeout: 60000 });
  await page.locator('#mAway').selectOption(away);
  await page.locator('#mHome').selectOption(home);
  await expect(page.locator('#mSubmit')).toBeEnabled();
  await page.locator('#mSubmit').click();
  await expect(page.locator('table.games')).toBeVisible({ timeout: 150000 });
}

// -------------------------------------------------- 1. a new visitor

test.describe('a new visitor', () => {
  test('the sales page states the real dataset size and the real prices', async ({ page }) => {
    await page.goto(`${SITE}/betlegend-pro/`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The graded-game count is read live. A hardcoded figure went stale once
    // already, and a stale count on a sales page is a false claim.
    const count = page.locator('#factGames');
    await expect(count).not.toHaveText('—', { timeout: 60000 });
    const shown = Number((await count.textContent()).replace(/[^\d]/g, ''));
    expect(shown, 'the headline dataset size must be a real six-figure count')
      .toBeGreaterThan(100000);

    for (const price of ['$19', '$149', '$349']) {
      await expect(page.getByText(price, { exact: false }).first()).toBeVisible();
    }
    // Derived, so the marketing can never drift from what is charged.
    await expect(page.getByText('$12.42/month')).toBeVisible();
  });

  test('the app itself is gated, with no way past it from the client', async ({ page }) => {
    await page.goto(`${SITE}/betlegend-pro/app/`);
    await expect(page.getByRole('heading', { name: /Sign in to open BetLegend Pro/i })).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();

    // Forcing the container visible must not produce a usable tool: the value
    // is behind the API, not behind a CSS class.
    await page.evaluate(() => {
      const host = document.getElementById('blpConsole');
      const app = host && host.shadowRoot && host.shadowRoot.getElementById('app');
      if (app) app.hidden = false;
    });
    const api = await pwRequest.newContext();
    for (const path of [
      '/api/betlegend-pro/status',
      '/api/betlegend-pro/history',
      '/api/betlegend-pro/teams/MLB',
      '/api/betlegend-pro/matchup-filters?sport=MLB',
      '/api/betlegend-pro/situations/MLB',
    ]) {
      const res = await api.get(API + path);
      expect(res.status(), `${path} must require authentication`).toBe(401);
    }
    // An unauthenticated submit is refused before any engine work happens.
    const submit = await api.post(`${API}/api/betlegend-pro/matchup-historical`, {
      data: { sport: 'MLB', team_1: 'New York Yankees', team_2: 'Boston Red Sox', idempotency_key: 'anon-probe' },
    });
    expect(submit.status()).toBe(401);
    await api.dispose();
  });

  test('the free tools are NOT paywalled by any of this', async ({ page }) => {
    await page.goto(`${SITE}/tools/`);
    await expect(page.locator('body')).not.toContainText(/sign in to open/i);
    const res = await page.goto(`${SITE}/mlb-season-simulator/`);
    expect(res.status()).toBeLessThan(400);
  });
});

// ---------------------------------------------- 2. a free TMR member

test.describe('a free TrustMyRecord member', () => {
  test.skip(!FREE.user, 'set BLP_LIVE_FREE_USER / BLP_LIVE_FREE_PASS');

  test('gets the tool, the daily allowance, and a route to buy', async ({ page }) => {
    await login(page, FREE);
    await expect(page.locator('#allowanceNotice')).toContainText(/free report/i);
    await expect(page.locator('#upgradeBtn')).toBeVisible();
    await expect(page.locator('#upgradeBtn')).toHaveAttribute('href', '/betlegend-pro/#pricing');
    // Not a subscriber: no plan chip claiming otherwise.
    await expect(page.locator('#planChip')).toBeHidden();
  });
});

// ------------------------------------------------- 3. a subscriber

test.describe('a BetLegend Pro subscriber', () => {
  test.skip(!SUB.user, 'set BLP_LIVE_SUB_USER / BLP_LIVE_SUB_PASS');

  test('runs an unlimited report and is never shown an upsell', async ({ page }) => {
    await login(page, SUB);
    await expect(page.locator('#planChip')).toBeVisible();
    await expect(page.locator('#upgradeBtn')).toBeHidden();
    await expect(page.locator('#mSubmit')).toContainText(/Included/);

    await runReport(page, { away: 'New York Yankees', home: 'Boston Red Sox' });
    await expect(page.locator('#mResult')).toContainText(/qualifying meeting/i);
  });

  test('the numbers in a report agree with each other', async ({ page }) => {
    await login(page, SUB);
    await runReport(page, { away: 'New York Yankees', home: 'Boston Red Sox' });

    const facts = await page.evaluate(() => {
      const root = document.getElementById('blpConsole').shadowRoot;
      const table = root.querySelector('table.games');
      const rows = [...table.tBodies[0].rows];
      const cell = (r, i) => r.cells[i].textContent.trim();
      return {
        listed: rows.length,
        heading: root.querySelector('.rcard-head h3').textContent,
        favourites: rows.map((r) => cell(r, 6)),
        moneylines: rows.map((r) => cell(r, 8)),
        dates: rows.map((r) => cell(r, 0)),
      };
    });

    // The listed count is stated, never implied.
    expect(facts.heading).toMatch(new RegExp(String(facts.listed).replace(/(\d)(?=(\d{3})+$)/g, '$1,')));

    // MLB's run line is a fixed +/-1.5 and says nothing about who was
    // favoured, so the Favorite column must carry a PRICE. A favourite laying
    // a positive handicap is the self-contradiction this replaced.
    for (const fav of facts.favourites) {
      expect(fav, `"${fav}" pairs a favourite with a fixed run line`).not.toMatch(/[+-]1\.5$/);
    }
    // And the side named must be the cheaper of the two prices on the row.
    facts.favourites.forEach((fav, i) => {
      const prices = [...facts.moneylines[i].matchAll(/(.+?)\s([+-]\d+)/g)];
      if (prices.length !== 2 || fav === '—') return;
      const cheaper = Number(prices[0][2]) < Number(prices[1][2]) ? prices[0] : prices[1];
      expect(fav, `row ${facts.dates[i]}: favourite must be the cheaper price`)
        .toContain(cheaper[2]);
    });

    // No future game may sit in a historical sample.
    const today = new Date().toISOString().slice(0, 10);
    for (const date of facts.dates) expect(date <= today).toBe(true);
  });
});

// ------------------------------------- 4. a bettor building a situation

test.describe('a bettor building a specific situation', () => {
  test.skip(!SUB.user, 'set BLP_LIVE_SUB_USER / BLP_LIVE_SUB_PASS');

  test('a situation the sport cannot answer is refused, for free, before it runs', async ({ page }) => {
    await login(page, SUB);
    await page.getByRole('tab', { name: 'Team Trends' }).click();
    const select = page.locator('#tSituation');
    // MLB: a spread size cannot separate games behind a fixed +/-1.5 run line.
    await expect(select.locator('option[value="large_spread"]')).toBeDisabled();
    await expect(select.locator('option[value="close_spread"]')).toBeDisabled();
    // NFL: it can, and is offered.
    await page.locator('#tSport').selectOption('NFL');
    await expect(select.locator('option[value="large_spread"]')).toBeEnabled();
  });

  test('a favourite/underdog split is not the wrong side of itself', async ({ page }) => {
    await login(page, SUB);
    await page.getByRole('tab', { name: 'Team Trends' }).click();
    await page.locator('#tSport').selectOption('NFL');
    await expect(page.locator('#tTeam option[value="Kansas City Chiefs"]')).toHaveCount(1, { timeout: 60000 });
    await page.locator('#tTeam').selectOption('Kansas City Chiefs');
    await page.locator('#tSituation').selectOption('home_favorite');
    await page.locator('#tSubmit').click();
    await expect(page.locator('#tResult')).toBeVisible({ timeout: 150000 });

    const text = await page.locator('#tResult').innerText();
    const record = text.match(/(\d+)-(\d+)(?:-(\d+))?/);
    expect(record, 'a straight-up record must be reported').not.toBeNull();
    const [wins, losses] = [Number(record[1]), Number(record[2])];
    // This is the check that would have caught the inversion: the API used to
    // answer "home favourites" with home UNDERDOGS, and Kansas City at home as
    // a favourite came back 60-72. Any team good enough to be laid points at
    // home wins more of those than it loses; a losing record here means the
    // filter is answering the other question.
    expect(wins, `Kansas City as a home favourite came back ${wins}-${losses}`)
      .toBeGreaterThan(losses);
    expect(wins + losses).toBeGreaterThan(100);
  });
});
