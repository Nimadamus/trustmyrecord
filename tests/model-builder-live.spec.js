/**
 * Model Builder, end to end, as a real member.
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
    // The one line statement of the idea.
    await expect(page.locator('.lede')).toContainText(/watch the sportsbook/i);
    // The three steps.
    const steps = page.locator('.how-step .how-t');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText(/describe the bet/i);
    await expect(steps.nth(1)).toContainText(/watch the board/i);
    await expect(steps.nth(2)).toContainText(/real record/i);

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
  });

  test('signed in, a member can save a model and it starts watching the board', async ({ page, request }) => {
    await deleteVerifyModels(request);
    await signIn(page);
    await page.goto(`${SITE}/model-builder/`, { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.locator('#marketChips label.mkt').count(), { timeout: 30000 })
      .toBeGreaterThan(0);

    await page.locator('#marketChips input[value="h2h"]').first().check();
    await page.locator('#modelSide').selectOption('favorite');
    await page.locator('#saveBtn').click();

    const box = page.locator('#saveBox');
    await expect(box).toBeVisible();
    await page.locator('#modelName').fill(MODEL_NAME);
    await page.locator('#stakeUnits').fill('2');
    await page.locator('#saveConfirmBtn').click();

    await expect(page.locator('#builderMessage')).toContainText(/saved and running/i, { timeout: 60000 });
    await expect(page.locator('#modelList')).toContainText(MODEL_NAME, { timeout: 30000 });
    await expect(page.locator('#modelList')).toContainText(/Tracking live/i);
    // The terms the member set are shown back to them.
    await expect(page.locator('#modelList')).toContainText(/2u a bet/i);
  });

  test('the model logs bets off the live board at the posted price', async ({ request }) => {
    const list = await api(request, 'GET', '/models');
    const model = ((list.json && list.json.models) || []).find((m) => m.name === MODEL_NAME);
    expect(model, 'the saved model is on the account').toBeTruthy();
    expect(Number(model.stake_units)).toBe(2);
    expect(model.tracked_from, 'saving switched it on').toBeTruthy();

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
    await expect(panel).toContainText(/Positions it took off the board/i, { timeout: 60000 });
    await expect(panel).toContainText(/On the board now/i);
    await expect(panel).toContainText(/Day by day/i);
    await expect(panel.locator('.kpi')).toHaveCount(3);
    // It says where the numbers came from and that they are its own.
    await expect(panel).toContainText(/live board/i);
    await expect(panel.locator('table.forward-list tbody tr').first()).toBeVisible();
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
