/**
 * Supplementary coverage for the TMR Challenge page: CANCEL and MOBILE LAYOUT.
 *
 * tests/tmr-challenges.spec.js covers eleven flows and deliberately owns the main path. It
 * does not touch cancel (zero references) or render at a phone width (zero references), and
 * both were on the verification list, so they are added here in a separate file rather than
 * by editing a suite another session is actively working in.
 *
 * Same guarantees as the suite it supplements: LOCAL ONLY. Every production API call is
 * rerouted to localhost, so a run can never cancel a real challenge or move live TMR.
 *
 * Prerequisites, both local:
 *   node server.js                (trustmyrecord-backend, port 3000, local dev database)
 *   node tests/static-server.cjs  (this repo, port 5500)
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const BACKEND = path.join(__dirname, '../../trustmyrecord-backend');
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });

const PROD_API = 'https://trustmyrecord-api.onrender.com/api';
const LOCAL_API = process.env.TMR_LOCAL_API || 'http://localhost:3000/api';

if (process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is set. This suite writes challenges and is for LOCAL only.');
}

const pool = require(path.join(BACKEND, 'config/database'));

/** Top up through the ledger, never by assigning a balance: the wallet must stay equal to the
 *  sum of its own ledger, and a harness that assigns breaks that identity permanently. */
async function fundWallet(userId, target) {
  await pool.query(
    'INSERT INTO tmr_coin_wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING',
    [userId]);
  const before = Number((await pool.query(
    'SELECT balance FROM tmr_coin_wallets WHERE user_id = $1', [userId])).rows[0].balance);
  const delta = Number(target) - before;
  if (!delta) return before;
  await pool.query(
    `INSERT INTO tmr_coin_ledger
       (user_id, entry_type, amount, balance_before, balance_after, source_action, idempotency_key, actor_type, bucket)
     VALUES ($1, 'admin_adjustment', $2, $3, $4, 'admin_adjustment', $5, 'admin', 'promotional')`,
    [userId, delta, before, before + delta,
      `e2e_fund_cm:${userId}:${before}:${target}:${process.pid}:${Math.abs(delta)}`]);
  await pool.query('UPDATE tmr_coin_wallets SET balance = $2 WHERE user_id = $1', [userId, target]);
  return target;
}

const bal = async (id) => Number((await pool.query(
  'SELECT balance FROM tmr_coin_wallets WHERE user_id = $1', [id])).rows[0].balance);

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

test.afterEach(async ({ context }) => {
  await Promise.all(context.pages().map(
    (p) => p.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})));
});

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

/** Issue an open challenge as `user` and return its database row. */
async function issueOpen(page, user, stake, marker) {
  await signIn(page, user);
  await page.goto('/tmr-challenges/');
  await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });
  await page.click('.tab[data-tab="create"]');
  await page.selectOption('#fFormat', 'multi_pick');
  await page.fill('#fStake', String(stake));
  await page.fill('#fTerms', marker);
  await page.click('#createBtn');
  await expect(page.locator('#panelMsg')).toContainText('Challenge issued', { timeout: 20000 });
  const { rows } = await pool.query(
    "SELECT * FROM tmr_challenges WHERE terms->>'note' = $1 ORDER BY id DESC LIMIT 1", [marker]);
  expect(rows.length, 'the challenge reached the database').toBe(1);
  return rows[0];
}

test.describe('TMR Challenges, cancel and mobile', () => {
  /**
   * Cancel is the issuer backing out AFTER both sides are committed, which is the case worth
   * proving: the money is in escrow at that point, so a cancel that refunds one side, or
   * neither, or leaves escrow behind, is a real loss. Cancelling a pending offer moves nothing
   * and would prove much less.
   */
  test('cancelling an accepted challenge refunds both sides and releases the escrow', async ({ page, context }) => {
    const STAKE = 40;
    const marker = 'e2e cancel ' + process.pid + '-' + test.info().workerIndex;
    const c = await issueOpen(page, A, STAKE, marker);

    const aBefore = await bal(A.id);
    const bBefore = await bal(B.id);

    // B takes the other side. Now both stakes are committed.
    const other = await context.newPage();
    await signIn(other, B);
    await other.goto('/tmr-challenges/');
    await expect(other.locator('#chBody')).toBeVisible({ timeout: 30000 });
    await other.click('.tab[data-tab="open"]');
    const offer = other.locator(`.row[data-id="${c.id}"]`);
    await expect(offer).toBeVisible();
    await offer.getByRole('button', { name: 'Take it' }).click();
    await expect(other.locator('#panelMsg')).toContainText('Both stakes are now held', { timeout: 20000 });
    // The message is written before the refresh it triggers returns. Waiting for the offer to
    // leave the open board is what proves the refresh landed.
    await expect(other.locator(`#listOpen .row[data-id="${c.id}"]`)).toHaveCount(0);

    const accepted = (await pool.query('SELECT status, escrow_total FROM tmr_challenges WHERE id = $1', [c.id])).rows[0];
    expect(accepted.status, 'both sides are committed').toBe('accepted');
    expect(Number(accepted.escrow_total), 'escrow holds both stakes').toBe(STAKE * 2);
    expect(await bal(A.id), 'the issuer is short their stake').toBe(aBefore - STAKE);
    expect(await bal(B.id), 'the taker is short their stake').toBe(bBefore - STAKE);

    // The issuer cancels. Every stake must come back.
    await page.reload();
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="active"]');
    const mine = page.locator(`#listActive .row[data-id="${c.id}"]`);
    await expect(mine).toBeVisible();
    await mine.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#panelMsg')).toContainText('Every stake was refunded', { timeout: 20000 });
    await expect(page.locator(`#listActive .row[data-id="${c.id}"]`)).toHaveCount(0);

    const after = (await pool.query(
      'SELECT status, escrow_total, escrow_state FROM tmr_challenges WHERE id = $1', [c.id])).rows[0];
    expect(after.status, 'the challenge is cancelled').toBe('cancelled');
    // escrow_total is the HISTORICAL amount that was escrowed and deliberately stays at 80.
    // escrow_state is the live flag. Asserting escrow_total === 0 here is the obvious wrong
    // guess, and it fails against correct code, so it is written out rather than left as a trap
    // for whoever edits this next.
    expect(Number(after.escrow_total), 'escrow_total records what was staked, historically').toBe(STAKE * 2);
    expect(after.escrow_state, 'nothing is still held').toBe('refunded');
    expect(await bal(A.id), 'the issuer is whole again').toBe(aBefore);
    expect(await bal(B.id), 'the taker is whole again').toBe(bBefore);
    const escrow = await pool.query(
      'SELECT state FROM tmr_challenge_escrow WHERE challenge_id = $1', [c.id]);
    expect(escrow.rows.length, 'both escrow rows survive as history').toBe(2);
    expect(escrow.rows.every((r) => r.state === 'refunded'), 'every escrow row is refunded').toBe(true);

    // A cancelled challenge belongs in Completed, not Active.
    await page.click('.tab[data-tab="completed"]');
    await expect(page.locator(`#listCompleted .row[data-id="${c.id}"]`)).toHaveCount(1);
  });

  /**
   * A page that overflows sideways on a phone is broken for most of the people who will ever
   * see it. Asserting scrollWidth against clientWidth catches the usual cause, a fixed width or
   * an unwrapped row, which no desktop run would ever reveal.
   */
  test('the hub is usable at phone width without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 class
    await signIn(page, A);
    await page.goto('/tmr-challenges/');
    await expect(page.locator('#chBody')).toBeVisible({ timeout: 30000 });

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: document.documentElement.clientWidth,
    }));
    expect(overflow.doc, `page overflows horizontally at 390px (${overflow.doc} > ${overflow.win})`)
      .toBeLessThanOrEqual(overflow.win + 1);

    // Every tab has to be reachable, not merely present in the DOM behind an overflow.
    for (const tab of ['open', 'incoming', 'active', 'completed', 'create']) {
      const el = page.locator(`.tab[data-tab="${tab}"]`);
      await expect(el, `the ${tab} tab is visible at phone width`).toBeVisible();
      const box = await el.boundingBox();
      expect(box.x, `the ${tab} tab starts on screen`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `the ${tab} tab ends on screen`).toBeLessThanOrEqual(391);
    }

    await page.click('.tab[data-tab="create"]');
    await expect(page.locator('#fStake'), 'the create form is usable at phone width').toBeVisible();
  });
});
