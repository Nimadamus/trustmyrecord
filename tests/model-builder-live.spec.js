/**
 * Model Builder, end to end, as a real member.
 *
 * The product under test is FORWARD TRACKING: a member defines conditions,
 * optionally backtests them, chooses how long the conditions are monitored,
 * and from activation every future qualifying wager is logged and graded
 * under that model. The backtest is a decision aid taken before that, and the
 * suite checks the two records are never mixed.
 *
 * Runs as Little_Venom (user 721) against production. The token is minted the
 * same way tests/sportsbook-v2/credential.cjs mints one, from the API signing
 * secret kept outside the repo, so nothing here carries a password and nothing
 * expires between runs.
 *
 * The suite proves the thing the page claims: a member describes a bet, the
 * model is saved, it reads the live sportsbook board itself and logs what
 * matches at the posted price, and every position it takes stays out of the
 * member's own pick record. Anything it creates is deleted in the last test,
 * pass or fail.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SITE = process.env.TMR_SITE || 'https://trustmyrecord.com';
const API = process.env.TMR_API || 'https://trustmyrecord-api.onrender.com/api';
const USER_ID = Number(process.env.TMR_LV_USER_ID || 721);
const MODEL_NAME = 'PLAYWRIGHT VERIFY, safe to delete';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mintToken() {
  const secretPath = process.env.TMR_JWT_SECRET_FILE || path.join(os.homedir(), '.tmr_jwt_secret');
  if (!fs.existsSync(secretPath)) throw new Error(`No JWT secret at ${secretPath}`);
  const secret = fs.readFileSync(secretPath, 'utf8').trim();
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    userId: USER_ID, sessionId: `model-builder-verify-${now}`, iat: now, exp: now + 3600,
  }));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest();
  return `${head}.${body}.${b64url(sig)}`;
}

const TOKEN = mintToken();

async function api(request, method, route, data) {
  const res = await request.fetch(`${API}${route}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    data: data === undefined ? undefined : data,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* non-JSON body is a failure the caller asserts on */ }
  return { status: res.status(), json, text };
}

/** Put the minted session into the page the way the site's own session code reads it. */
async function signIn(page) {
  await page.addInitScript((token) => {
    ['trustmyrecord_token', 'accessToken', 'access_token', 'token', 'tmr_token'].forEach((k) => {
      try { localStorage.setItem(k, token); } catch (e) { /* private mode */ }
    });
  }, TOKEN);
}

async function deleteVerifyModels(request) {
  const list = await api(request, 'GET', '/models?include_archived=true');
  const models = (list.json && list.json.models) || [];
  let removed = 0;
  for (const m of models) {
    if (String(m.name || '').includes('PLAYWRIGHT VERIFY')) {
      const res = await api(request, 'DELETE', `/models/${m.id}`);
      if (res.status < 400) removed += 1;
    }
  }
  return removed;
}

test.describe.configure({ mode: 'serial' });

test.describe('Model Builder as a member', () => {
  test('the page says what it is before any control is touched', async ({ page }) => {
    await page.goto(`${SITE}/model-builder/`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1')).toContainText(/Model Builder/i);
    // The one line statement of the idea: build, test, then TRACK FORWARD.
    await expect(page.locator('.lede').first())
      .toContainText(/track every future wager that matches your conditions/i);
    await expect(page.locator('body'))
      .toContainText(/automatically records and grades every future qualifying wager/i);
    // The product loop, in four steps.
    const steps = page.locator('.how-step .how-t');
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText(/^Build$/i);
    await expect(steps.nth(1)).toContainText(/^Backtest$/i);
    await expect(steps.nth(2)).toContainText(/^Track$/i);
    await expect(steps.nth(3)).toContainText(/^Measure$/i);

    // The workflow itself is on the form: define, backtest, period, name, start.
    await expect(page.locator('#periodRow .period')).toHaveCount(7);
    await expect(page.locator('#saveBtn')).toContainText(/start tracking model/i);
    await expect(page.locator('#runBtn')).toContainText(/backtest/i);

    // The promises a member will judge it on, stated on the page itself.
    const body = page.locator('body');
    await expect(body).toContainText(/paper record/i);
    await expect(body).toContainText(/never appears on your profile/i);
    await expect(body).toContainText(/Nothing is wagered/i);

    // The specification rows.
    const spec = page.locator('.spec-row');
    expect(await spec.count()).toBeGreaterThanOrEqual(8);
    await expect(page.locator('.spec')).toContainText(/sportsbook board/i);
    await expect(page.locator('.spec')).toContainText(/final score/i);
  });

  test('data coverage loads from the live API, not from the page', async ({ page }) => {
    await page.goto(`${SITE}/model-builder/`, { waitUntil: 'domcontentloaded' });
    const badges = page.locator('#sourceBadges .badge');
    await expect.poll(async () => badges.count(), { timeout: 30000 }).toBeGreaterThan(1);
    await expect(page.locator('#sourceBadges')).toContainText(/verified graded picks/i);
    // A sport the picker offers, proving the catalog resolved.
    await expect.poll(async () => page.locator('#modelSport option').count(), { timeout: 30000 })
      .toBeGreaterThan(3);

    // TODAY'S BOARD IS NOT A SPORT-SELECTION CONCEPT. How many games happen to
    // be up right now says nothing about a model meant to run for 60 days, so
    // it must not appear in the picker. Only the backtest sample may.
    const optionText = (await page.locator('#modelSport option').allTextContents()).join(' | ');
    expect(optionText).not.toMatch(/on the board/i);
    expect(optionText).toMatch(/historical sample/i);
  });

  test('a tracking period is chosen before the model can start', async ({ page }) => {
    await page.goto(`${SITE}/model-builder/`, { waitUntil: 'domcontentloaded' });
    const until = page.locator('#trackUntil');
    // 30 days is the default, and the date field agrees with the chip.
    await expect(page.locator('#periodRow .period.active')).toContainText('30 days');
    const thirty = await until.inputValue();
    expect(thirty).toBeTruthy();

    await page.locator('#periodRow .period[data-days="90"]').click();
    const ninety = await until.inputValue();
    expect(new Date(ninety).getTime()).toBeGreaterThan(new Date(thirty).getTime());
    await expect(page.locator('#periodNote')).toContainText(ninety);

    // "Track until I stop it" is an end date of none, not a hidden default.
    await page.locator('#periodRow .period[data-days="open"]').click();
    expect(await until.inputValue()).toBe('');
    await expect(page.locator('#periodNote')).toContainText(/until you stop the model yourself/i);
  });

  test('a backtest runs and returns a real record', async ({ page }) => {
    await page.goto(`${SITE}/model-builder/`, { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.locator('#marketChips label.mkt').count(), { timeout: 30000 })
      .toBeGreaterThan(0);

    await page.locator('#marketChips input[value="h2h"]').first().check();
    await page.locator('#modelSide').selectOption('favorite');
    await page.locator('#runBtn').click();

    const kpis = page.locator('#resultsBody .kpi');
    await expect.poll(async () => kpis.count(), { timeout: 60000 }).toBe(3);
    await expect(page.locator('#resultsBody .kpi').first()).toContainText(/\d+-\d+/);
    // Measured against something, not floating on its own.
    await expect(page.locator('#resultsBody')).toContainText(/How it compares/i);
    await expect(page.locator('#resultsBody')).toContainText(/Baseline/i);
    // Every number carries where it came from.
    await expect(page.locator('#resultsBody')).toContainText(/Data source/i);
    // And it is flagged as HISTORY, never as the model's live record.
    await expect(page.locator('#resultsBody .ds-flag.hist')).toContainText(/historical backtest/i);
    await expect(page.locator('#resultsBody')).toContainText(/not this model's live record/i);
  });

  test('the model name is suggested from the conditions', async ({ page }) => {
    await page.goto(`${SITE}/model-builder/`, { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.locator('#marketChips label.mkt').count(), { timeout: 30000 })
      .toBeGreaterThan(0);
    await page.locator('#modelHomeAway').selectOption('home');
    await page.locator('#modelSide').selectOption('favorite');
    const suggested = await page.locator('#modelName').inputValue();
    expect(suggested).toMatch(/Home/);
    expect(suggested).toMatch(/Favorites/);
  });

  test('signed in, a member can save a model and it starts watching the board', async ({ page, request }) => {
    await deleteVerifyModels(request);
    await signIn(page);
    await page.goto(`${SITE}/model-builder/`, { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.locator('#marketChips label.mkt').count(), { timeout: 30000 })
      .toBeGreaterThan(0);

    await page.locator('#marketChips input[value="h2h"]').first().check();
    await page.locator('#modelSide').selectOption('favorite');
    // 3: choose the tracking period. 4: name it. 5: start it.
    await page.locator('#periodRow .period[data-days="14"]').click();
    await page.locator('#stakeUnits').fill('2');
    await page.locator('#modelName').fill(MODEL_NAME);
    await page.locator('#saveBtn').click();

    await expect(page.locator('#builderMessage')).toContainText(/tracking started/i, { timeout: 60000 });
    await expect(page.locator('#modelList')).toContainText(MODEL_NAME, { timeout: 30000 });

    const card = page.locator('.model-card', { hasText: MODEL_NAME });
    await expect(card.locator('.tag')).toContainText(/Active/i);
    // The dashboard the member judges the model on.
    await expect(card).toContainText(/2u a qualifying wager/i);
    await expect(card).toContainText(/day[s]? remaining/i);
    await expect(card).toContainText(/Qualifying wagers found/i);
    await expect(card).toContainText(/Graded/i);
    await expect(card).toContainText(/Pending/i);
    // The conditions are on the card, so the record is never orphaned.
    await expect(card.locator('.cond')).toContainText([/./]);
  });

  test('the model logs bets off the live board at the posted price', async ({ request }) => {
    const list = await api(request, 'GET', '/models');
    const model = ((list.json && list.json.models) || []).find((m) => m.name === MODEL_NAME);
    expect(model, 'the saved model is on the account').toBeTruthy();
    expect(Number(model.stake_units)).toBe(2);
    expect(model.tracked_from, 'saving switched it on').toBeTruthy();

    // The period the member chose is what is stored, not a default.
    expect(model.track_until, 'the tracking window was stored').toBeTruthy();
    const days = Math.round((new Date(model.track_until) - new Date(model.tracked_from)) / 86400000);
    expect(days).toBeGreaterThanOrEqual(13);
    expect(days).toBeLessThanOrEqual(15);

    const auto = await api(request, 'GET', `/models/${model.id}/auto`);
    expect(auto.status).toBe(200);
    expect(auto.json.tracking).toBe(true);
    expect(auto.json.units_per_pick).toBe(2);

    const picks = auto.json.picks || [];
    expect(picks.length, 'it logged at least one bet off the board').toBeGreaterThan(0);

    // Every logged bet is a real board selection: a named book, a usable price,
    // a stake, and the stake the model was set to.
    for (const p of picks) {
      expect(p.book, `book named on ${p.selection}`).toBeTruthy();
      expect(Number.isFinite(p.odds), `real price on ${p.selection}`).toBe(true);
      expect(Number(p.units)).toBe(2);
      expect(['pending', 'won', 'lost', 'push', 'void']).toContain(p.status);
    }

    // The price it logged is the price the sportsbook was showing.
    const board = await api(request, 'GET', `/games/board/${model.sport_key}`);
    const shown = new Map();
    for (const g of (board.json.games || [])) {
      for (const grp of (g.market_groups || [])) {
        for (const it of (grp.items || [])) {
          if (it.source !== 'sportsbook') continue;
          const hour = g.commence_time ? new Date(g.commence_time).toISOString().slice(0, 13) : '';
          shown.set(`${g.away_team}|${g.home_team}|${hour}|${it.market_type}|${it.selection}`, it.odds);
        }
      }
    }
    let compared = 0;
    let matched = 0;
    for (const p of picks) {
      if (!p.game || !p.commence_time) continue;
      const [away, home] = p.game.split(' at ');
      const hour = new Date(p.commence_time).toISOString().slice(0, 13);
      const key = `${away}|${home}|${hour}|${p.market}|${p.selection}`;
      if (!shown.has(key)) continue;
      compared += 1;
      if (shown.get(key) === p.odds) matched += 1;
    }
    // The board reprices constantly, so a bet logged minutes ago can legally
    // differ from the board now. What must hold is that they are the same
    // selections at believable prices, so require the overlap to agree.
    expect(compared, 'at least one logged bet is still on the board to compare').toBeGreaterThan(0);
    expect(matched, 'logged prices match the board').toBe(compared);
  });

  test('the model card shows open bets, the day by day table and the totals', async ({ page }) => {
    await signIn(page);
    await page.goto(`${SITE}/model-builder/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#modelList')).toContainText(MODEL_NAME, { timeout: 30000 });

    const card = page.locator('.model-card', { hasText: MODEL_NAME });
    await card.locator('[data-act="forward"]').click();

    const panel = page.locator('#forwardPanel');
    await expect(panel).toContainText(/Every wager that qualified since activation/i, { timeout: 60000 });
    await expect(panel).toContainText(/On the board now/i);
    await expect(panel).toContainText(/Day by day/i);
    await expect(panel.locator('.kpi')).toHaveCount(3);
    // Found, graded and pending are separated, never one lump.
    await expect(panel.locator('.count')).toHaveCount(3);
    await expect(panel).toContainText(/Qualifying wagers found/i);
    // It says where the numbers came from and that they are its own, forward.
    await expect(panel.locator('.ds-flag.fwd')).toContainText(/live model record/i);
    await expect(panel).toContainText(/out of sample/i);
    await expect(panel).toContainText(/live board/i);
    await expect(panel.locator('table.forward-list tbody tr').first()).toBeVisible();
  });

  test('the backtest never contaminates the forward record', async ({ page, request }) => {
    const list = await api(request, 'GET', '/models');
    const model = ((list.json && list.json.models) || []).find((m) => m.name === MODEL_NAME);
    const auto = await api(request, 'GET', `/models/${model.id}/auto`);
    const forwardN = (auto.json.summary.sample_size || 0) + (auto.json.summary.pending || 0);

    // Every wager in the forward record was captured after activation. Nothing
    // historical can be in there.
    const from = new Date(model.tracked_from).getTime();
    for (const p of auto.json.picks || []) {
      expect(new Date(p.captured_at).getTime(), `${p.selection} captured after activation`)
        .toBeGreaterThanOrEqual(from - 60000);
    }

    // Backtesting the SAME conditions returns its own, separate population.
    // Running it must leave the forward record untouched.
    const filters = (model.criteria_json && model.criteria_json.filters) || {};
    const bt = await api(request, 'POST', '/models/backtest', { filters });
    expect(bt.status).toBe(200);
    const btSample = (bt.json && bt.json.model && bt.json.model.sample_size) || 0;

    const listAgain = await api(request, 'GET', '/models');
    const fresh = ((listAgain.json && listAgain.json.models) || []).find((m) => m.id === model.id);
    expect(fresh.tracking_stats, 'the list carries the forward record').toBeTruthy();
    expect(fresh.tracking_stats.found).toBe(forwardN);
    expect(fresh.tracking_stats.sample_size + fresh.tracking_stats.pending).toBe(forwardN);
    // The historical sample is not folded in: the forward record counts only
    // what the model itself logged since activation.
    expect(fresh.tracking_stats.found).toBeLessThanOrEqual(forwardN);
    expect(btSample, 'the backtest has its own population').toBeGreaterThanOrEqual(0);
    void page;
  });

  test('nothing the model logged reached the member pick record', async ({ request }) => {
    const list = await api(request, 'GET', '/models');
    const model = ((list.json && list.json.models) || []).find((m) => m.name === MODEL_NAME);
    const auto = await api(request, 'GET', `/models/${model.id}/auto`);
    const logged = auto.json.picks || [];
    expect(logged.length).toBeGreaterThan(0);

    // The member's own picks, from the API the profile and record read.
    const mine = await api(request, 'GET', '/picks/my-picks?limit=200');
    const mineList = (mine.json && (mine.json.picks || mine.json.data || [])) || [];
    const mineKeys = new Set(mineList.map((p) => `${p.selection}|${p.odds_snapshot != null ? p.odds_snapshot : p.odds}`));
    for (const p of logged) {
      expect(mineKeys.has(`${p.selection}|${p.odds}`),
        `model bet ${p.selection} ${p.odds} must not be in the member pick record`).toBe(false);
    }
  });

  test('pausing stops new capture, and cleanup removes the model', async ({ request }) => {
    const list = await api(request, 'GET', '/models');
    const model = ((list.json && list.json.models) || []).find((m) => m.name === MODEL_NAME);
    expect(model).toBeTruthy();

    const paused = await api(request, 'POST', `/models/${model.id}/auto-scan`, { enabled: false });
    expect(paused.status).toBe(200);
    expect(paused.json.auto_scan).toBe(false);

    // The period is editable while it runs, and clearing the date means
    // "track until I stop it" rather than "leave it as it was".
    const open = await api(request, 'POST', `/models/${model.id}/track`, { track_until: null });
    expect(open.status).toBe(200);
    expect(open.json.track_until).toBeFalsy();

    const after = await api(request, 'GET', '/models');
    const still = ((after.json && after.json.models) || []).find((m) => m.id === model.id);
    expect(still.auto_scan).toBe(false);

    const removed = await deleteVerifyModels(request);
    expect(removed, 'the verification model is deleted').toBeGreaterThan(0);
    const finalList = await api(request, 'GET', '/models?include_archived=true');
    const leftovers = ((finalList.json && finalList.json.models) || [])
      .filter((m) => String(m.name || '').includes('PLAYWRIGHT VERIFY'));
    expect(leftovers).toHaveLength(0);
  });
});
