/**
 * REPORT_UNGRADED_WAGER_20260830 - end to end, user side and admin side.
 *
 * Runs against a LOCAL backend on the isolated tmr_stripe_test database and a
 * LOCAL copy of the site. Every request the page would send to the production
 * API is rerouted to localhost, so a run can never file a report, notify a real
 * member or leave a row on the live site. That reroute is also what makes the
 * run meaningful: the pages are exercised exactly as shipped - config.js,
 * backend-api.js, the real endpoints - rather than against a stub that would
 * agree with a broken page.
 *
 * Prerequisites, both local:
 *   node server.js                (trustmyrecord-backend, port 3000, tmr_stripe_test)
 *   node tests/static-server.cjs  (this repo, port 5500)
 *
 * Run:
 *   npx playwright test --config=playwright.grading-reports.config.cjs
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const BACKEND = path.join(__dirname, '../../trustmyrecord-backend');
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));
const { Pool } = require(path.join(BACKEND, 'node_modules/pg'));

const PROD_API = 'https://trustmyrecord-api.onrender.com/api';
const LOCAL_API = process.env.TMR_LOCAL_API || 'http://localhost:3000/api';
const DB_URL = process.env.DATABASE_URL || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const JWT_SECRET = process.env.JWT_SECRET || '';

if (!/tmr_stripe_test/.test(DB_URL)) {
  throw new Error('DATABASE_URL must point at the tmr_stripe_test database. This suite writes rows.');
}
if (!JWT_SECRET || !ADMIN_TOKEN) {
  throw new Error('JWT_SECRET and ADMIN_TOKEN must match the local backend under test.');
}

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 1 });

// The test database lives on a shared Render instance whose connection budget
// is shared with production and its six crons, so a brand new connection is
// occasionally refused with "Connection terminated unexpectedly". That is the
// harness's problem, not the feature's: retry a few times rather than reporting
// a red suite for someone else's connection pressure.
async function q(text, params) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await pool.query(text, params);
    } catch (error) {
      lastError = error;
      if (!/Connection terminated|ECONNRESET|timeout/i.test(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
  throw lastError;
}

const HOUR = 3600 * 1000;
const TAG = 'grspec';
const GAME_REPORTABLE = `${TAG}_soccer_qualifying`;
const GAME_TOO_RECENT = `${TAG}_mlb_recent`;

let user;
let reportablePickId;
let tooRecentPickId;

function ticket(id) {
  return String(id).padStart(7, '0');
}

async function upsertGame(id, row) {
  await q(
    `INSERT INTO games (id, sport_key, sport_title, home_team, away_team, commence_time,
                        home_score, away_score, completed)
     VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,false)
     ON CONFLICT (id) DO UPDATE SET
       sport_key = EXCLUDED.sport_key, sport_title = EXCLUDED.sport_title,
       home_team = EXCLUDED.home_team, away_team = EXCLUDED.away_team,
       commence_time = EXCLUDED.commence_time,
       home_score = NULL, away_score = NULL, completed = false`,
    [id, row.sport_key, row.sport_title, row.home_team, row.away_team, row.commence_time]
  );
}

async function insertPick(gameId, row) {
  const result = await q(
    `INSERT INTO picks (user_id, game_id, sport_key, market_type, selection,
                        odds_snapshot, units, stake_mode, risk_units, selected_team, locked_at)
     VALUES ($1,$2,$3,'h2h',$4,$5,1,'risk',1,$4,$6) RETURNING id`,
    [user.id, gameId, row.sport_key, row.selection, row.odds, new Date(Date.now() - 40 * HOUR)]
  );
  return result.rows[0].id;
}

test.beforeAll(async () => {
  const users = await q(
    'SELECT id, username FROM users WHERE is_active = true ORDER BY id DESC LIMIT 1'
  );
  expect(users.rows.length, 'the test database needs a user').toBe(1);
  user = users.rows[0];

  const now = Date.now();
  // A competition nobody has mapped. SOCCER_GENERIC_KEY_20260831 taught score
  // ingestion to resolve the board's generic 'soccer' key from sport_title, so
  // the original Manchester City shape ('soccer' + 'EPL') is healthy now. What
  // still strands a wager is a competition with no entry at all - a qualifying
  // round, a lower division - where no final can ever reach the row and the
  // grader never even attempts the pick.
  await upsertGame(GAME_REPORTABLE, {
    sport_key: 'soccer', sport_title: 'Champions League Qualifying',
    home_team: 'Shamrock Rovers', away_team: 'Ararat-Armenia',
    commence_time: new Date(now - 30 * HOUR),
  });
  await upsertGame(GAME_TOO_RECENT, {
    sport_key: 'baseball_mlb', sport_title: 'MLB',
    home_team: 'Recent Home', away_team: 'Recent Away',
    commence_time: new Date(now - 2 * HOUR),
  });

  reportablePickId = await insertPick(GAME_REPORTABLE, {
    sport_key: 'soccer', selection: 'Shamrock Rovers', odds: -353,
  });
  tooRecentPickId = await insertPick(GAME_TOO_RECENT, {
    sport_key: 'baseball_mlb', selection: 'Recent Home', odds: -120,
  });
});

test.afterAll(async () => {
  const ids = [reportablePickId, tooRecentPickId].filter(Boolean);
  if (ids.length) {
    await q('DELETE FROM grading_reports WHERE pick_id = ANY($1::int[])', [ids]);
    await q('DELETE FROM notifications WHERE related_pick_id = ANY($1::int[])', [ids]);
    const client = await pool.connect();
    try {
      // Picks are immutable and undeletable by design, so the fixture is
      // withdrawn exactly the way production withdraws a pick.
      await client.query("SET LOCAL tmr.allow_pick_repair = 'on'");
      await client.query('UPDATE picks SET deleted_at = NOW() WHERE id = ANY($1::int[])', [ids]);
    } finally {
      client.release();
    }
  }
  await pool.end();
});

test.afterEach(async ({ context }) => {
  await Promise.all(context.pages().map(
    (p) => p.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})
  ));
});

async function useLocalApi(page) {
  await page.route(`${PROD_API}/**`, async (route) => {
    const request = route.request();
    const url = request.url().replace(PROD_API, LOCAL_API);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res });
  });
}

/** Sign the page in as the fixture user. The login form is not what is under test. */
async function signIn(page) {
  await useLocalApi(page);
  const token = jwt.sign({ id: user.id, userId: user.id }, JWT_SECRET, { expiresIn: '30m' });
  await page.addInitScript((t) => {
    localStorage.setItem('accessToken', t);
    localStorage.setItem('token', t);
  }, token);
}

async function signInAdmin(page) {
  await useLocalApi(page);
  await page.addInitScript((t) => { localStorage.setItem('tmr_admin_token', t); }, ADMIN_TOKEN);
}

/**
 * Playwright starts a fresh worker after any failure, which re-runs beforeAll
 * and mints new fixture picks. Each admin test therefore guarantees its own
 * precondition instead of inheriting one from the test above it: an open report
 * on the fixture wager, filed through the real member endpoint.
 */
async function ensureOpenUserReport() {
  const open = await q(
    "SELECT id FROM grading_reports WHERE pick_id = $1 AND status IN ('new','investigating')",
    [reportablePickId]
  );
  if (open.rowCount) return open.rows[0].id;

  const token = jwt.sign({ id: user.id, userId: user.id }, JWT_SECRET, { expiresIn: '30m' });
  const response = await fetch(`${LOCAL_API}/grading-reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pick_id: reportablePickId, comment: 'Game ended yesterday and this is still pending.' }),
  });
  expect(response.status, await response.text()).toBe(201);
  const created = await q(
    'SELECT id FROM grading_reports WHERE pick_id = $1 ORDER BY id DESC LIMIT 1', [reportablePickId]
  );
  return created.rows[0].id;
}

test.describe('Report Ungraded Wager - member', () => {
  test('a stale pending ticket offers the report, a fresh one says when it unlocks', async ({ page }) => {
    await signIn(page);
    await page.goto('/my-pending-picks/');
    await expect(page.locator('#pendingPanel')).toBeVisible();

    const stale = page.locator(`tr:has(td:text-is("${ticket(reportablePickId)}"))`);
    const fresh = page.locator(`tr:has(td:text-is("${ticket(tooRecentPickId)}"))`);
    await expect(stale).toBeVisible();
    await expect(fresh).toBeVisible();

    // Reportable: the button is right there on the ticket.
    await expect(stale.locator('button.report-btn')).toHaveText('Report Ungraded Wager');

    // Not reportable yet: no button, and the row says WHEN instead of nothing,
    // so nobody has to wonder why the option is missing.
    await expect(fresh.locator('button.report-btn')).toHaveCount(0);
    await expect(fresh).toContainText('This wager can be reported after');
  });

  test('report, confirm, done - and the wager cannot be reported twice', async ({ page }) => {
    await signIn(page);
    await page.goto('/my-pending-picks/');
    const stale = page.locator(`tr:has(td:text-is("${ticket(reportablePickId)}"))`);
    await expect(stale.locator('button.report-btn')).toBeVisible();

    // Click 1 of 2.
    await stale.locator('button.report-btn').click();
    const modal = page.locator('#reportModal');
    await expect(modal).toBeVisible();

    // The form is pre-filled from the ticket. The member types nothing.
    await expect(modal).toContainText(ticket(reportablePickId));
    await expect(modal).toContainText('Shamrock Rovers');
    await expect(modal).toContainText('Ararat-Armenia @ Shamrock Rovers');
    await expect(modal).toContainText('-353');
    await expect(modal).toContainText('Moneyline');

    await modal.locator('#reportComment').fill('Game ended yesterday and this is still pending.');

    // Click 2 of 2.
    await modal.locator('#reportSubmitBtn').click();
    await expect(modal.locator('#reportMsg')).toHaveText("Report submitted. We'll review the grading status.");

    // The ticket updates in place; no second report is possible from the UI.
    await expect(stale).toContainText('Awaiting review');
    await expect(stale.locator('button.report-btn')).toHaveCount(0);

    const stored = await q(
      'SELECT status, source, comment, snapshot FROM grading_reports WHERE pick_id = $1',
      [reportablePickId]
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0].status).toBe('new');
    expect(stored.rows[0].source).toBe('user');
    expect(stored.rows[0].comment).toContain('still pending');
    // Everything attached automatically, with nothing typed by the member.
    expect(stored.rows[0].snapshot.selection).toBe('Shamrock Rovers');
    expect(stored.rows[0].snapshot.market).toBe('h2h');
    expect(stored.rows[0].snapshot.odds).toBe(-353);
    expect(stored.rows[0].snapshot.league).toBe('Champions League Qualifying');
    expect(stored.rows[0].snapshot.username).toBe(user.username);
    expect(stored.rows[0].snapshot.status_at_report).toBe('pending');
  });

  test('the reported state survives a reload and a duplicate is refused by name', async ({ page }) => {
    await signIn(page);
    await page.goto('/my-pending-picks/');
    const stale = page.locator(`tr:has(td:text-is("${ticket(reportablePickId)}"))`);
    await expect(stale).toContainText('Awaiting review');
    await expect(stale.locator('button.report-btn')).toHaveCount(0);

    // The guard is server side, not merely a hidden button.
    const duplicate = await page.evaluate(async (pickId) => {
      try {
        await window.api.reportUngradedWager(pickId, null);
        return { status: 200, message: 'unexpectedly accepted' };
      } catch (error) {
        return { status: error.status, message: error.message };
      }
    }, reportablePickId);
    expect(duplicate.status).toBe(409);
    expect(duplicate.message).toBe('This wager has already been reported and is awaiting review.');
  });

  test('the report option is on the mobile ticket too', async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/my-pending-picks/');
    const card = page.locator(`.pending-card:has-text("${ticket(tooRecentPickId)}")`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('This wager can be reported after');
  });
});

test.describe('Report Ungraded Wager - admin', () => {
  test('the report lands in the queue with the wager already attached', async ({ page }) => {
    await ensureOpenUserReport();
    await signInAdmin(page);
    await page.goto('/admin/grading-reports/');

    const row = page.locator(`tr:has-text("${ticket(reportablePickId)}")`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(user.username);
    await expect(row).toContainText('Ararat-Armenia @ Shamrock Rovers');
    await expect(row).toContainText('PENDING');
    await expect(row).toContainText('no final score');
    await expect(row.locator('.pill.new')).toHaveText('NEW');
    await expect(page.locator('#openCount')).not.toHaveText('-');
    expect(Number(await page.locator('#openCount').textContent())).toBeGreaterThan(0);
  });

  test('the system investigates before an admin looks at it', async ({ page }) => {
    await ensureOpenUserReport();
    await signInAdmin(page);
    await page.goto('/admin/grading-reports/');
    const row = page.locator(`tr:has-text("${ticket(reportablePickId)}")`);
    await expect(row).toBeVisible();

    await row.locator('[data-investigate]').click();
    await expect(page.locator(`tr:has-text("${ticket(reportablePickId)}") .cause`))
      .toHaveText('provider_sport_key_unmapped');

    // The reason has to be specific enough to act on, not just a label.
    await page.locator(`tr:has-text("${ticket(reportablePickId)}") details`).first().click();
    await expect(page.locator(`tr:has-text("${ticket(reportablePickId)}")`))
      .toContainText('does not resolve to any ESPN scoreboard league');

    // A review layer that graded the wager itself would be the bug this
    // feature is meant to prevent.
    const pick = await q('SELECT status FROM picks WHERE id = $1', [reportablePickId]);
    expect(pick.rows[0].status).toBe('pending');
  });

  test('resolving the report notifies the member inside TMR', async ({ page }) => {
    await ensureOpenUserReport();
    await signInAdmin(page);
    await page.goto('/admin/grading-reports/');
    const rowSelector = `tr:has-text("${ticket(reportablePickId)}")`;
    await expect(page.locator(rowSelector)).toBeVisible();

    // A resolved report leaves the default "open" view, which is the point of
    // that view; switch to All so the resolution is still on screen afterwards.
    await page.locator('#statusFilter').selectOption('');
    await expect(page.locator(rowSelector)).toBeVisible();

    await page.locator(`${rowSelector} [data-status]`).selectOption('investigating');
    await page.locator(`${rowSelector} [data-note]`).fill('Qualifying round: no ESPN league covers this fixture.');
    await page.locator(`${rowSelector} [data-save]`).click();
    await expect(page.locator(`${rowSelector} .pill.investigating`)).toHaveText('INVESTIGATING');

    await page.locator(`${rowSelector} [data-status]`).selectOption('resolved_push_void');
    await page.locator(`${rowSelector} [data-save]`).click();
    await expect(page.locator(`${rowSelector} .pill.resolved`)).toHaveText('RESOLVED - PUSH/VOID');
    await expect(page.locator(rowSelector)).toContainText('user notified');

    const report = await q(
      'SELECT id FROM grading_reports WHERE pick_id = $1 ORDER BY id DESC LIMIT 1', [reportablePickId]
    );
    const notif = await q(
      'SELECT type, content FROM notifications WHERE dedupe_key = $1',
      [`grading_report_resolved:${report.rows[0].id}`]
    );
    expect(notif.rowCount).toBe(1);
    expect(notif.rows[0].type).toBe('grading_report_resolved');
    expect(notif.rows[0].content)
      .toBe(`Your reported wager #${ticket(reportablePickId)} has been reviewed and graded.`);
  });

  test('the stale audit finds an ungraded wager nobody reported', async ({ page }) => {
    // The member never reports this one; the hourly audit is what must catch it.
    await q('DELETE FROM grading_reports WHERE pick_id = $1', [reportablePickId]);
    await q('DELETE FROM notifications WHERE related_pick_id = $1', [reportablePickId]);

    await signInAdmin(page);
    await page.goto('/admin/grading-reports/');
    await page.locator('#scanBtn').click();
    await expect(page.locator('#output')).toContainText('"opened"');

    const row = page.locator(`tr:has-text("${ticket(reportablePickId)}")`);
    await expect(row).toBeVisible();
    // Nobody filed this one: the source pill says so, and the row still names
    // the member whose wager is stuck, because they are who it is about.
    await expect(row.locator('.pill.system')).toHaveText('system detected');
    await expect(row).toContainText(user.username);

    // Proactive, not indiscriminate: a wager whose event may still be running
    // is left alone.
    await expect(page.locator(`tr:has-text("${ticket(tooRecentPickId)}")`)).toHaveCount(0);
  });

  test('the main admin panel carries the open-report count', async ({ page }) => {
    await ensureOpenUserReport();
    await signInAdmin(page);
    await page.goto('/admin/');
    const tile = page.locator('#ungradedReports');
    await expect(tile).not.toHaveText('-');
    expect(Number(await tile.textContent())).toBeGreaterThan(0);
    await expect(page.locator('a[href="/admin/grading-reports/"]')).toBeVisible();
  });
});
