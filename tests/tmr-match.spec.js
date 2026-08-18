/**
 * End to end coverage for the TMR Match market page.
 *
 * LOCAL ONLY, same guarantees as the Challenge suite: every production API call is rerouted to
 * localhost, so a run can never post a real offer, take one, or move live TMR. It writes rows
 * to the local development database and throws if DATABASE_URL is set.
 *
 * Prerequisites, all local:
 *   node server.js                                    (trustmyrecord-backend, port 3000)
 *   TMR_STATIC_PORT=5501 node tests/static-server.cjs (this repo, port 5501)
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const BACKEND = path.join(__dirname, '../../trustmyrecord-backend');
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });

const PROD_API = 'https://trustmyrecord-api.onrender.com/api';
const LOCAL_API = process.env.TMR_LOCAL_API || 'http://localhost:3000/api';

if (process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is set. This suite writes offers and is for LOCAL only.');
}

const pool = require(path.join(BACKEND, 'config/database'));

/** Top up through the ledger by a DELTA, so the wallet stays equal to the sum of its rows. */
async function fundWallet(userId, add) {
  await pool.query(
    'INSERT INTO tmr_coin_wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING',
    [userId]);
  const before = Number((await pool.query(
    'SELECT balance FROM tmr_coin_wallets WHERE user_id = $1', [userId])).rows[0].balance);
  await pool.query(
    `INSERT INTO tmr_coin_ledger
       (user_id, entry_type, amount, balance_before, balance_after, source_action, idempotency_key, actor_type, bucket)
     VALUES ($1,'admin_adjustment',$2,$3,$4,'admin_adjustment',$5,'admin','promotional')`,
    [userId, add, before, before + add,
      `match_e2e_fund:${userId}:${before}:${add}:${process.pid}:${Math.random()}`]);
  await pool.query('UPDATE tmr_coin_wallets SET balance = balance + $2 WHERE user_id = $1', [userId, add]);
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
  for (const u of [A, B]) await fundWallet(u.id, 50000);
  await releaseRestingOffers();
});

/**
 * Start from a known book. Every run posts offers and only some tests cancel them, so after a
 * handful of runs the two test members sit on the 25-offer ceiling and the next run fails with
 * "you already have 25 offers resting" -- which is the cap working correctly, reported as if
 * the feature were broken. Withdrawing what this suite left behind is what makes it repeatable.
 *
 * Uses the real service so the reservations are released properly rather than by deleting rows,
 * which would strand the maker's TMR in a hold with nothing pointing at it.
 */
async function releaseRestingOffers() {
  const svc = require(path.join(BACKEND, 'services/tmrMatch'));
  for (const u of [A, B]) {
    const { rows } = await pool.query(
      `SELECT id FROM tmr_match_offers
        WHERE maker_id = $1 AND status IN ('open','partially_filled')`, [u.id]);
    for (const o of rows) {
      await svc.cancelRemainder({ offerId: o.id, makerId: u.id }).catch(() => {});
    }
  }
}

test.afterAll(async () => { await releaseRestingOffers().catch(() => {}); await pool.end(); });

test.afterEach(async ({ context }) => {
  await Promise.all(context.pages().map(
    (p) => p.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})));
});

/** Reroute the page's API calls to localhost. Signed out when `user` is null. */
async function useLocalApi(page, user) {
  await page.route(`${PROD_API}/**`, async (route) => {
    const req = route.request();
    const url = req.url().replace(PROD_API, LOCAL_API);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res });
  });
  if (!user) {
    await page.addInitScript(() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('token');
    });
    return;
  }
  const token = jwt.sign({ id: user.id, userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30m' });
  await page.addInitScript((t) => {
    localStorage.setItem('accessToken', t);
    localStorage.setItem('token', t);
  }, token);
}

/** Post an offer through the FORM, which is what a member actually does. */
async function postOfferViaUi(page, { selection, price = -110, quantity = 100 }) {
  await page.click('.tab[data-tab="create"]');
  await page.fill('#fEvent', 'Giants at Dodgers');
  await page.fill('#fSelection', selection);
  await page.fill('#fPrice', String(price));
  await page.fill('#fQty', String(quantity));
  await page.click('#createBtn');
  await expect(page.locator('#panelMsg')).toContainText('Your offer is up', { timeout: 20000 });
  const { rows } = await pool.query(
    'SELECT * FROM tmr_match_offers WHERE selection = $1 ORDER BY id DESC LIMIT 1', [selection]);
  expect(rows.length, 'the offer reached the database').toBe(1);
  return rows[0];
}

const uniq = (p) => `${p}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

test.describe('TMR Match', () => {
  test('a signed out visitor can read the market but is not offered any action', async ({ page }) => {
    await useLocalApi(page, null);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#signedOutNote')).toBeVisible();
    await expect(page.locator('#signedOutNote')).toContainText('Sign in');
    // The market is public; the things that move money are not even rendered.
    await expect(page.locator('[data-take]')).toHaveCount(0);
    await expect(page.locator('.tab[data-tab="create"]')).toBeHidden();
    await expect(page.locator('.tab[data-tab="mine"]')).toBeHidden();
  });

  test('the market page loads with its cards, tabs and an honest empty state', async ({ page }) => {
    await useLocalApi(page, A);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#loadState')).toBeHidden();
    await expect(page.locator('#cOpen')).toBeVisible();
    await expect(page.locator('#balCard')).toBeVisible();
    for (const t of ['market', 'depth', 'mine', 'positions', 'create']) {
      await expect(page.locator(`.tab[data-tab="${t}"]`)).toBeVisible();
    }
    // Whichever list is empty must say something useful rather than showing nothing.
    await page.click('.tab[data-tab="positions"]');
    const empty = page.locator('#emptyPositions');
    if (await empty.isVisible()) await expect(empty).toContainText('No matches yet');
  });

  test('a member posts an offer and their TMR is held immediately', async ({ page }) => {
    await useLocalApi(page, A);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });

    const before = await bal(A.id);
    const sel = uniq('Giants ML');
    const offer = await postOfferViaUi(page, { selection: sel, quantity: 100 });

    expect(offer.status).toBe('open');
    expect(Number(offer.quantity)).toBe(100);
    expect(await bal(A.id), 'posting holds the TMR straight away').toBe(before - 100);

    // It lands in My offers, showing what is left of it.
    await page.click('.tab[data-tab="mine"]');
    const row = page.locator(`#listMine .offer[data-id="${offer.id}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('100 TMR');
    await expect(row).toContainText('left of 100 TMR');
  });

  test('the form refuses what the service would refuse, before sending anything', async ({ page }) => {
    await useLocalApi(page, A);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="create"]');

    await page.fill('#fEvent', '');
    await page.fill('#fSelection', 'Giants');
    await page.fill('#fPrice', '-110');
    await page.fill('#fQty', '100');
    await page.click('#createBtn');
    await expect(page.locator('#panelMsg')).toContainText('Which game');

    await page.fill('#fEvent', 'Giants at Dodgers');
    await page.fill('#fQty', '2');
    await page.click('#createBtn');
    await expect(page.locator('#panelMsg')).toContainText('smallest offer');

    await page.fill('#fQty', '100');
    await page.fill('#fPrice', '5');
    await page.click('#createBtn');
    await expect(page.locator('#panelMsg')).toContainText('American odds');

    // More TMR than the member holds is caught with their real number in the message.
    const have = await bal(A.id);
    await page.fill('#fPrice', '-110');
    await page.fill('#fQty', String(have + 5000));
    await page.click('#createBtn');
    await expect(page.locator('#panelMsg')).toContainText('spendable');
  });

  test('another member takes part of an offer, then the rest', async ({ page, context }) => {
    await useLocalApi(page, A);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    const sel = uniq('Dodgers ML');
    const offer = await postOfferViaUi(page, { selection: sel, quantity: 100 });

    const taker = await context.newPage();
    await useLocalApi(taker, B);
    await taker.goto('/tmr-match/');
    await expect(taker.locator('#mkBody')).toBeVisible({ timeout: 30000 });

    const card = taker.locator(`#listMarket .offer[data-id="${offer.id}"]`);
    await expect(card).toBeVisible();
    // The page must say what taking it means before anyone clicks.
    await expect(card.locator('.confirm')).toContainText('You would be betting against');

    const bBefore = await bal(B.id);
    await card.locator(`[data-qty="${offer.id}"]`).fill('40');
    await card.locator(`[data-take="${offer.id}"]`).click();
    await expect(taker.locator('#panelMsg')).toContainText('Matched 40 TMR', { timeout: 20000 });
    await expect(taker.locator('#panelMsg')).toContainText('60 TMR is still open');
    expect(await bal(B.id), 'the taker paid exactly what they took').toBe(bBefore - 40);

    // The board updates itself rather than needing a reload.
    await expect(taker.locator(`#listMarket .offer[data-id="${offer.id}"]`)).toContainText('60 TMR');
    await expect(taker.locator(`#listMarket .offer[data-id="${offer.id}"]`)).toContainText('40 taken');

    // "All of it" fills the remainder.
    const card2 = taker.locator(`#listMarket .offer[data-id="${offer.id}"]`);
    await card2.locator(`[data-all="${offer.id}"]`).click();
    await expect(card2.locator(`[data-qty="${offer.id}"]`)).toHaveValue('60');
    await card2.locator(`[data-take="${offer.id}"]`).click();
    await expect(taker.locator('#panelMsg')).toContainText('fully taken', { timeout: 20000 });

    const after = (await pool.query('SELECT * FROM tmr_match_offers WHERE id = $1', [offer.id])).rows[0];
    expect(after.status).toBe('filled');
    expect(Number(after.filled_quantity)).toBe(100);
    await expect(taker.locator(`#listMarket .offer[data-id="${offer.id}"]`)).toHaveCount(0);
  });

  test('a taken offer appears as a match for both sides and links to it', async ({ page, context }) => {
    await useLocalApi(page, A);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    const sel = uniq('Padres ML');
    const offer = await postOfferViaUi(page, { selection: sel, quantity: 60 });

    const taker = await context.newPage();
    await useLocalApi(taker, B);
    await taker.goto('/tmr-match/');
    await expect(taker.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    const card = taker.locator(`#listMarket .offer[data-id="${offer.id}"]`);
    await card.locator(`[data-take="${offer.id}"]`).click();
    await expect(taker.locator('#panelMsg')).toContainText('Matched', { timeout: 20000 });

    await taker.click('.tab[data-tab="positions"]');
    const pos = taker.locator('#listPositions .offer').first();
    await expect(pos).toBeVisible();
    await expect(pos).toContainText('You took this');
    await expect(pos).toContainText('at risk');
    await expect(pos.locator('a.btn')).toHaveAttribute('href', /\/tmr-challenges\/\?id=\d+/);

    await page.reload();
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="positions"]');
    await expect(page.locator('#listPositions')).toContainText('You posted this');
  });

  test('the maker withdraws what nobody took, and the taken part stays matched', async ({ page, context }) => {
    await useLocalApi(page, A);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    const sel = uniq('Cubs ML');
    const offer = await postOfferViaUi(page, { selection: sel, quantity: 100 });
    const afterPost = await bal(A.id);

    const taker = await context.newPage();
    await useLocalApi(taker, B);
    await taker.goto('/tmr-match/');
    await expect(taker.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    const card = taker.locator(`#listMarket .offer[data-id="${offer.id}"]`);
    await card.locator(`[data-qty="${offer.id}"]`).fill('30');
    await card.locator(`[data-take="${offer.id}"]`).click();
    await expect(taker.locator('#panelMsg')).toContainText('Matched 30 TMR', { timeout: 20000 });

    await page.reload();
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="mine"]');
    const mine = page.locator(`#listMine .offer[data-id="${offer.id}"]`);
    await expect(mine).toContainText('70 TMR');
    await expect(mine).toContainText('30 taken');
    await mine.locator(`[data-cancel="${offer.id}"]`).click();
    await expect(page.locator('#panelMsg')).toContainText('70 TMR is back in your balance', { timeout: 20000 });
    await expect(page.locator('#panelMsg')).toContainText('30 TMR already taken stays matched');

    expect(await bal(A.id), 'exactly the untaken part came back').toBe(afterPost + 70);
    const after = (await pool.query('SELECT * FROM tmr_match_offers WHERE id = $1', [offer.id])).rows[0];
    expect(after.status).toBe('cancelled');
    expect(Number(after.filled_quantity), 'the filled part is untouched').toBe(30);
  });

  test('a member is never offered the chance to take their own offer', async ({ page }) => {
    await useLocalApi(page, A);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    const sel = uniq('Mets ML');
    const offer = await postOfferViaUi(page, { selection: sel, quantity: 50 });

    await page.click('.tab[data-tab="market"]');
    const card = page.locator(`#listMarket .offer[data-id="${offer.id}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('Your offer');
    await expect(card.locator(`[data-take="${offer.id}"]`)).toHaveCount(0);
  });

  test('market depth reads as money behind a pick, not as a database table', async ({ page }) => {
    await useLocalApi(page, A);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    const sel = uniq('Braves ML');
    await postOfferViaUi(page, { selection: sel, quantity: 120, price: -120 });

    await page.click('.tab[data-tab="depth"]');
    const rung = page.locator('.ladder .rung').filter({ hasText: sel });
    await expect(rung).toBeVisible();
    await expect(rung).toContainText('Backing');
    await expect(rung).toContainText('120 TMR');
    // No raw column names anywhere on the page.
    const text = await page.locator('#mkBody').innerText();
    for (const jargon of ['escrow_lock', 'filled_quantity', 'reserved_total', 'price_american', 'event_ref']) {
      expect(text, `the page must not show "${jargon}"`).not.toContain(jargon);
    }
  });

  test('a double click cannot post the same offer twice', async ({ page }) => {
    await useLocalApi(page, A);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });
    const sel = uniq('Rays ML');

    await page.click('.tab[data-tab="create"]');
    await page.fill('#fEvent', 'Giants at Dodgers');
    await page.fill('#fSelection', sel);
    await page.fill('#fPrice', '-110');
    await page.fill('#fQty', '40');
    // Two clicks in the SAME tick, which is the case a disabled-after-click guard can miss.
    // Dispatched in the page rather than through two Playwright clicks, because Playwright
    // waits for actionability and would simply queue the second behind the first.
    await page.evaluate(() => {
      const b = document.getElementById('createBtn');
      b.click(); b.click();
    });
    await expect(page.locator('#panelMsg')).toContainText('Your offer is up', { timeout: 20000 });

    const { rows } = await pool.query(
      'SELECT id FROM tmr_match_offers WHERE selection = $1', [sel]);
    expect(rows.length, 'only one offer was created').toBe(1);
  });

  test('the market is usable at phone width without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await useLocalApi(page, A);
    await page.goto('/tmr-match/');
    await expect(page.locator('#mkBody')).toBeVisible({ timeout: 30000 });

    const o = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: document.documentElement.clientWidth,
    }));
    expect(o.doc, `page overflows horizontally at 390px (${o.doc} > ${o.win})`).toBeLessThanOrEqual(o.win + 1);

    for (const t of ['market', 'depth', 'mine', 'positions', 'create']) {
      const el = page.locator(`.tab[data-tab="${t}"]`);
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      expect(box.x + box.width, `the ${t} tab ends on screen`).toBeLessThanOrEqual(391);
    }
  });
});
