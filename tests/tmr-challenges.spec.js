/**
 * End to end coverage for the TMR Challenge page.
 *
 * This runs entirely against a LOCAL backend and a LOCAL copy of the site. Every request the
 * page would send to the production API is rerouted to localhost, so a test run can never
 * create a challenge, move TMR or leave a row on the live site. That reroute is also what makes
 * the run meaningful: the page is exercised exactly as shipped, config and api client included,
 * rather than against a stubbed API that would happily agree with a broken page.
 *
 * Prerequisites, both local:
 *   node server.js                (trustmyrecord-backend, port 3000, local dev database)
 *   node tests/static-server.cjs  (this repo, port 5500)
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

// jsonwebtoken and dotenv are resolved out of the backend rather than added as dependencies of
// this repo: the site itself does not need them, and only this local harness does.
const BACKEND = path.join(__dirname, '../../trustmyrecord-backend');
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });

const PROD_API = 'https://trustmyrecord-api.onrender.com/api';
const LOCAL_API = process.env.TMR_LOCAL_API || 'http://localhost:3000/api';

if (process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is set. This suite writes challenges and is for LOCAL only.');
}

// The backend's own pool module, so the suite reads exactly the database the running server
// writes to. Reconstructing the connection here from env vars is how a suite ends up silently
// asserting against a different database than the one under test.
const pool = require(path.join(BACKEND, 'config/database'));

/**
 * Top a wallet up by writing a ledger entry, never by assigning the balance. The wallet is
 * meant to equal the sum of its ledger; a harness that assigns a balance breaks that identity
 * permanently for that account and then hides real drift behind noise it created itself.
 */
async function fundWallet(userId, target) {
  await pool.query(
    `INSERT INTO tmr_coin_wallets (user_id, balance) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`, [userId]);
  const before = Number((await pool.query(
    'SELECT balance FROM tmr_coin_wallets WHERE user_id = $1', [userId])).rows[0].balance);
  const delta = Number(target) - before;
  if (!delta) return before;
  await pool.query(
    `INSERT INTO tmr_coin_ledger
       (user_id, entry_type, amount, balance_before, balance_after, idempotency_key,
        source_action, actor_type, bucket, admin_note)
     VALUES ($1, 'admin_adjustment', $2, $3, $4, $5, 'test_fixture_funding', 'admin', 'promotional',
             'local e2e fixture')`,
    [userId, delta, before, before + delta,
      `e2e_fund:${userId}:${before}:${target}:${process.pid}:${Math.abs(delta)}`]);
  await pool.query('UPDATE tmr_coin_wallets SET balance = $2 WHERE user_id = $1', [userId, target]);
  return target;
}

let A, B;

test.beforeAll(async () => {
  const { rows } = await pool.query(
    `SELECT id, username FROM users WHERE is_active = true AND COALESCE(account_type,'real') <> 'admin'
      ORDER BY id LIMIT 2`);
  expect(rows.length, 'two local users are needed').toBe(2);
  [A, B] = rows;
  for (const u of [A, B]) await fundWallet(u.id, 5000);
});

test.afterAll(async () => { await pool.end(); });

/**
 * Every page in the context proxies the production API to localhost through a route callback.
 * A click that triggers a background refresh can still have a request in that callback when the
 * test body returns, and teardown then closes the page underneath it, which surfaces as
 * "route.fetch: Target page, context or browser has been closed".
 *
 * The tests below are written so the assertion they end on only becomes true after the refresh
 * has landed, which is the real fix. This is the remaining guarantee: any request a test did not
 * explicitly wait for is released rather than racing the close. It suppresses nothing the tests
 * assert on -- unroute only stops the interception, and by this point the test has already
 * passed or failed on its own assertions.
 */
test.afterEach(async ({ context }) => {
  await Promise.all(context.pages().map(
    (p) => p.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})));
});

/**
 * Point the page at the local API and sign it in as `user`. The token is minted here rather
 * than by logging in through the form, because what is under test is the challenge page, not
 * the login page, and a password would have to be invented to do it the other way.
 */
async function signIn(page, user) {
  await page.route(`${PROD_API}/**`, async (route) => {
    const url = route.request().url().replace(PROD_API, LOCAL_API);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res });
  });
  const token = jwt.sign({ id: user.id, userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30m' });
  await page.addInitScript((t) => {
    localStorage.setItem('accessToken', t);
    localStorage.setItem('token', t);
  }, token);
}

test.describe('TMR Challenges', () => {
  test('signed out visitors are asked to sign in and see no challenge data', async ({ page }) => {
    await page.route(`${PROD_API}/**`, (route) => route.abort());
    await page.goto('/tmr-challenges/');
    await expect(page.locator('#signedOut')).toBeVisible();
    await expect(page.locator('#chBody')).toBeHidden();
  });

  test('the hub loads with a balance, tabs and the open board', async ({ page }) => {
    await signIn(page, A);
    await page.goto('/tmr-challenges/');
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#balVal')).toContainText('TMR');
    await expect(page.locator('.tab[data-tab="open"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#panel-open')).toBeVisible();
  });

  test('the create form is driven by the service, not by hardcoded copy', async ({ page }) => {
    await signIn(page, A);
    await page.goto('/tmr-challenges/');
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="create"]');

    // Six formats come from FORMATS in services/tmrChallenge.js. A page that had grown its own
    // list would drift the moment a format was added or renamed.
    await expect(page.locator('#fFormat option')).toHaveCount(6);
    await expect(page.locator('#stakeHint')).toContainText('Minimum 10 TMR');
    await expect(page.locator('#createNote')).toContainText('0 basis points');
  });

  test('a member issues an open challenge and another member takes it', async ({ page, context }) => {
    await signIn(page, A);
    await page.goto('/tmr-challenges/');
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });

    const before = Number((await pool.query(
      'SELECT balance FROM tmr_coin_wallets WHERE user_id = $1', [A.id])).rows[0].balance);

    await page.click('.tab[data-tab="create"]');
    await page.selectOption('#fFormat', 'multi_pick');
    await page.fill('#fStake', '40');
    const marker = 'e2e open ' + process.pid + '-' + test.info().workerIndex;
    await page.fill('#fTerms', marker);
    await page.click('#createBtn');

    await expect(page.locator('#panelMsg')).toContainText('Challenge issued', { timeout: 20000 });
    const row = await pool.query(
      "SELECT * FROM tmr_challenges WHERE terms->>'note' = $1 ORDER BY id DESC LIMIT 1", [marker]);
    expect(row.rows.length, 'the challenge reached the database').toBe(1);
    const c = row.rows[0];
    expect(c.visibility).toBe('open');
    expect(c.status).toBe('pending');
    expect(Number(c.stake)).toBe(40);

    // Issuing costs nothing. TMR only moves when somebody accepts.
    const after = Number((await pool.query(
      'SELECT balance FROM tmr_coin_wallets WHERE user_id = $1', [A.id])).rows[0].balance);
    expect(after, 'issuing an offer moves no TMR').toBe(before);

    // The author must not be able to take their own offer off the open board. Scoped to
    // #listOpen: the same challenge is legitimately rendered in the author's Active list, and an
    // unscoped .row[data-id] matched that hidden row and reported the offer as visible to its
    // own author. It must be absent from the open board and present in Active, so assert both.
    await page.click('.tab[data-tab="open"]');
    await expect(page.locator(`#listOpen .row[data-id="${c.id}"]`)).toHaveCount(0);
    await expect(page.locator(`#listActive .row[data-id="${c.id}"]`)).toHaveCount(1);

    const other = await context.newPage();
    await signIn(other, B);
    await other.goto('/tmr-challenges/');
    await expect(other.locator('#chBody')).toBeVisible({ timeout: 30000 });
    const offer = other.locator(`.row[data-id="${c.id}"]`);
    await expect(offer).toBeVisible();
    await offer.getByRole('button', { name: 'Take it' }).click();
    await expect(other.locator('#panelMsg')).toContainText('Both stakes are now held', { timeout: 20000 });
    // The message is written before the refresh it triggers has returned. Waiting for the offer
    // to leave the open board is what proves the refresh landed, so the test does not end with
    // four requests still in flight.
    await expect(other.locator(`#listOpen .row[data-id="${c.id}"]`)).toHaveCount(0);
    await expect(other.locator(`#listActive .row[data-id="${c.id}"]`)).toHaveCount(1);

    const accepted = (await pool.query('SELECT * FROM tmr_challenges WHERE id = $1', [c.id])).rows[0];
    expect(accepted.status).toBe('accepted');
    expect(Number(accepted.opponent_id)).toBe(Number(B.id));
    expect(Number(accepted.escrow_total)).toBe(80);
    expect(accepted.escrow_state).toBe('held');
    expect(accepted.terms_hash, 'terms lock on acceptance').toBeTruthy();

    const held = await pool.query(
      'SELECT user_id, amount, state FROM tmr_challenge_escrow WHERE challenge_id = $1 ORDER BY user_id', [c.id]);
    expect(held.rows.length, 'both sides are escrowed').toBe(2);
    expect(held.rows.every((r) => Number(r.amount) === 40 && r.state === 'held')).toBe(true);

    const drained = Number((await pool.query(
      'SELECT balance FROM tmr_coin_wallets WHERE user_id = $1', [A.id])).rows[0].balance);
    expect(drained, 'the stake left the wallet on acceptance').toBe(before - 40);

    // Ledger entries for a challenge are transfers, never issuance. If they were counted as
    // issuance they would eat the emission budget and inflate supply.
    const ledger = await pool.query(
      `SELECT entry_type FROM tmr_coin_ledger
        WHERE idempotency_key IN ($1, $2)`,
      [`challenge_stake:${c.id}:${A.id}`, `challenge_stake:${c.id}:${B.id}`]);
    expect(ledger.rows.length).toBe(2);
    expect(ledger.rows.every((r) =>
      !['reward', 'admin_grant', 'admin_adjustment', 'reversed'].includes(r.entry_type))).toBe(true);
  });

  test('a direct challenge is offered to one member and can be declined', async ({ page, context }) => {
    await signIn(page, A);
    await page.goto('/tmr-challenges/');
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });

    await page.click('.tab[data-tab="create"]');
    await page.selectOption('#fFormat', 'multi_pick');
    await page.fill('#fStake', '15');
    await page.fill('#fOpponent', B.username);
    const marker = 'e2e direct ' + process.pid + '-' + test.info().workerIndex;
    await page.fill('#fTerms', marker);
    await page.click('#createBtn');
    await expect(page.locator('#panelMsg')).toContainText('Challenge issued', { timeout: 20000 });

    const c = (await pool.query(
      "SELECT * FROM tmr_challenges WHERE terms->>'note' = $1 ORDER BY id DESC LIMIT 1", [marker])).rows[0];
    expect(c.visibility).toBe('direct');
    expect(Number(c.opponent_id)).toBe(Number(B.id));

    // Creating triggers a background refresh. Waiting for the new challenge to appear in the
    // author's Active list is what proves that refresh returned, so this page is idle before
    // the test moves on to the opponent.
    await expect(page.locator(`#listActive .row[data-id="${c.id}"]`)).toHaveCount(1);

    const other = await context.newPage();
    await signIn(other, B);
    await other.goto('/tmr-challenges/');
    await expect(other.locator('#chBody')).toBeVisible({ timeout: 30000 });
    await other.click('.tab[data-tab="incoming"]');
    const inc = other.locator(`#listIncoming .row[data-id="${c.id}"]`);
    await expect(inc).toBeVisible();
    await inc.getByRole('button', { name: 'Decline' }).click();
    await expect(other.locator('#panelMsg')).toContainText('No TMR moved', { timeout: 20000 });
    // Same reason as above: end on the refreshed list, not on the message that precedes it.
    await expect(other.locator(`#listIncoming .row[data-id="${c.id}"]`)).toHaveCount(0);

    const declined = (await pool.query('SELECT * FROM tmr_challenges WHERE id = $1', [c.id])).rows[0];
    expect(declined.status).toBe('declined');
    expect(Number(declined.escrow_total)).toBe(0);
  });

  test('an unknown opponent is refused instead of quietly posted openly', async ({ page }) => {
    await signIn(page, A);
    await page.goto('/tmr-challenges/');
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="create"]');
    await page.selectOption('#fFormat', 'multi_pick');
    await page.fill('#fStake', '20');
    await page.fill('#fOpponent', 'definitely_not_a_member_9f2a');
    const marker = 'e2e ghost ' + process.pid + '-' + test.info().workerIndex;
    await page.fill('#fTerms', marker);
    await page.click('#createBtn');

    await expect(page.locator('#panelMsg.err')).toContainText('No member called', { timeout: 20000 });
    const rows = await pool.query(
      "SELECT id FROM tmr_challenges WHERE terms->>'note' = $1", [marker]);
    expect(rows.rows.length, 'nothing was created').toBe(0);
  });

  test('a stake beyond the ceiling is refused with the reason shown', async ({ page }) => {
    await signIn(page, A);
    await page.goto('/tmr-challenges/');
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="create"]');
    await page.selectOption('#fFormat', 'multi_pick');
    await page.fill('#fStake', '999999');
    const marker = 'e2e too big ' + process.pid + '-' + test.info().workerIndex;
    await page.fill('#fTerms', marker);
    await page.click('#createBtn');

    await expect(page.locator('#panelMsg.err')).toBeVisible({ timeout: 20000 });
    const rows = await pool.query(
      "SELECT id FROM tmr_challenges WHERE terms->>'note' = $1", [marker]);
    expect(rows.rows.length, 'an over-ceiling stake creates nothing').toBe(0);
  });

  test('the detail page shows the locked terms and the event history', async ({ page }) => {
    const c = (await pool.query(
      `SELECT id FROM tmr_challenges WHERE status = 'accepted' AND terms_hash IS NOT NULL
         AND (challenger_id = $1 OR opponent_id = $1) ORDER BY id DESC LIMIT 1`, [A.id])).rows[0];
    test.skip(!c, 'no accepted challenge exists for this user yet');

    await signIn(page, A);
    await page.goto(`/tmr-challenges/?id=${c.id}`);
    await expect(page.locator('#detail')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#dCard')).toContainText('Terms are locked and unchanged');
    await expect(page.locator('#dCard')).toContainText('held in escrow');
    expect(await page.locator('#dHistory tr').count()).toBeGreaterThan(0);
  });

  test('a participant disputes a live challenge and the pot stops paying out', async ({ page, context }) => {
    // Build a live challenge through the UI so the dispute is raised on real escrow.
    await signIn(page, A);
    await page.goto('/tmr-challenges/');
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="create"]');
    await page.selectOption('#fFormat', 'multi_pick');
    await page.fill('#fStake', '30');
    const marker = 'e2e dispute ' + process.pid + '-' + test.info().workerIndex;
    await page.fill('#fTerms', marker);
    await page.click('#createBtn');
    await expect(page.locator('#panelMsg')).toContainText('Challenge issued', { timeout: 20000 });

    const c = (await pool.query(
      "SELECT * FROM tmr_challenges WHERE terms->>'note' = $1 ORDER BY id DESC LIMIT 1", [marker])).rows[0];
    await expect(page.locator(`#listActive .row[data-id="${c.id}"]`)).toHaveCount(1);

    const other = await context.newPage();
    await signIn(other, B);
    await other.goto('/tmr-challenges/');
    await expect(other.locator('#chBody')).toBeVisible({ timeout: 30000 });
    await other.locator(`#listOpen .row[data-id="${c.id}"]`).getByRole('button', { name: 'Take it' }).click();
    await expect(other.locator(`#listActive .row[data-id="${c.id}"]`)).toHaveCount(1);

    // A live challenge says so plainly rather than leaving the member to read a status pill.
    const row = page.locator(`#listActive .row[data-id="${c.id}"]`);
    await page.click('.tab[data-tab="active"]');
    await page.reload();
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="active"]');
    await expect(row.locator('.meta')).toContainText('both stakes held in escrow');

    page.once('dialog', (d) => d.accept('the wrong line was graded'));
    await row.getByRole('button', { name: 'Dispute' }).click();
    await expect(page.locator('#panelMsg')).toContainText('stays in escrow', { timeout: 20000 });
    await expect(row.locator('.meta')).toContainText('disputed');

    const disputed = (await pool.query('SELECT * FROM tmr_challenges WHERE id = $1', [c.id])).rows[0];
    expect(disputed.dispute_status).toBe('open');
    expect(disputed.dispute_reason).toBe('the wrong line was graded');
    expect(Number(disputed.disputed_by)).toBe(Number(A.id));
    expect(disputed.escrow_state, 'the pot is still held').toBe('held');

    // The whole point of a dispute: settlement is refused while it is open.
    const svc = require(path.join(BACKEND, 'services/tmrChallenge'));
    await svc.markAwaitingSettlement({ challengeId: c.id });
    let refused = null;
    try {
      await svc.settleChallenge({ challengeId: c.id, outcome: 'challenger', resultSource: 'manual_confirmation' });
    } catch (e) { refused = e; }
    expect(refused, 'a disputed challenge must not settle').not.toBeNull();
    expect(refused.code).toBe('DISPUTED');

    const still = (await pool.query(
      "SELECT status, escrow_state FROM tmr_challenges WHERE id = $1", [c.id])).rows[0];
    expect(still.status).toBe('awaiting_settlement');
    expect(still.escrow_state).toBe('held');
  });

  /**
   * Runs as BetLegend rather than the users the rest of the suite uses. Those are
   * account_type='test' and the profile API refuses them, and the standing rule is to test as
   * BetLegend or Little_Venom rather than create an account for it. Everything here stays on
   * the local dev database.
   */
  test('the challenge record appears on the profile, apart from the verified record', async ({ page }) => {
    const bl = (await pool.query(
      "SELECT id, username FROM users WHERE LOWER(username) = 'betlegend' AND is_active = true")).rows[0];
    test.skip(!bl, 'BetLegend does not exist on this local database');

    const svc = require(path.join(BACKEND, 'services/tmrChallenge'));
    await fundWallet(bl.id, 5000);

    // Give the profile something real to report: one challenge carried all the way to a
    // settled win, so the record, the TMR figures and the counts are all non-trivial.
    const marker = 'e2e profile ' + process.pid + '-' + test.info().workerIndex;
    const c = await svc.createChallenge({
      challengerId: bl.id, opponentId: B.id, format: 'multi_pick', stake: 50,
      terms: { note: marker }, expiresAt: new Date(Date.now() + 36e5).toISOString(),
    });
    await svc.acceptChallenge({ challengeId: c.id, opponentId: B.id });
    await svc.markAwaitingSettlement({ challengeId: c.id });
    await svc.settleChallenge({
      challengeId: c.id, outcome: 'challenger', resultSource: 'manual_confirmation',
      resultRef: marker,
    });

    const res = await fetch(`${LOCAL_API}/tmr-challenges/stats/by-username/${encodeURIComponent(bl.username)}`);
    expect(res.status, 'the public record endpoint answers without a token').toBe(200);
    const stats = await res.json();
    expect(Number(stats.total), 'this member has challenges to report').toBeGreaterThan(0);
    expect(Number(stats.completed), 'the settled challenge is counted').toBeGreaterThan(0);

    // The identity that ties the display figures to the ledger: realised profit minus whatever
    // is still locked in escrow is exactly what the ledger has moved for this member.
    expect(stats.ledger_net).toBe(stats.tmr_net - stats.tmr_in_escrow);
    expect(stats.record).toBe(`${stats.wins}-${stats.losses}` + (stats.pushes ? `-${stats.pushes}` : ''));

    await signIn(page, bl);
    await page.goto(`/profile/?user=${encodeURIComponent(bl.username)}`);
    const section = page.locator('#tmrxChallengeSection');
    await expect(section).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#tmrxChRecord')).toHaveText(stats.record);
    await expect(page.locator('#tmrxChCompleted')).toHaveText(String(stats.completed));
    await expect(page.locator('#tmrxChActive')).toHaveText(String(stats.active));
    await expect(page.locator('#tmrxChWon')).toContainText('TMR');

    // It must never be presented as, or merged into, the verified handicapping record.
    await expect(section).toContainText('Separate from the verified pick record');
    const advRecord = page.locator('#profileAdvRecord');
    if (await advRecord.count()) {
      const verified = (await advRecord.textContent() || '').trim();
      expect(verified, 'the verified record is not the challenge record')
        .not.toBe(stats.record);
    }
  });

  test('the live challenge system is not touched by any of this', async ({ page }) => {
    // The old system keeps its own tables. A TMR challenge that wrote into them would be a
    // silent merge of two systems that were deliberately kept apart.
    const before = await pool.query(
      'SELECT (SELECT COUNT(*) FROM open_challenges)::int a, (SELECT COUNT(*) FROM challenges)::int b');
    await signIn(page, A);
    await page.goto('/tmr-challenges/');
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });
    const after = await pool.query(
      'SELECT (SELECT COUNT(*) FROM open_challenges)::int a, (SELECT COUNT(*) FROM challenges)::int b');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
