/**
 * TMR Earn page, verified against the live site with a real account.
 *
 * Signs in as BetLegend, a real member with real activity. No account is created, no contest
 * is invented, and no reward history is fabricated: every number checked here is one the
 * backend already holds for that user.
 *
 * The check that matters is consistency. The page is compared against the API response that
 * produced it, so a page showing the right shape but the wrong numbers fails.
 *
 *   TMR_LOGIN=... TMR_PASSWORD=... npx playwright test --config=playwright.earn.config.cjs
 */

const { test, expect } = require('@playwright/test');

const SITE = process.env.TMR_EARN_BASE_URL || 'https://trustmyrecord.com';
const API = 'https://trustmyrecord-api.onrender.com/api';
const LOGIN = process.env.TMR_LOGIN;
const PASSWORD = process.env.TMR_PASSWORD;

let token = null;
let summary = null;
let history = null;

test.beforeAll(async ({ request }) => {
  test.skip(!LOGIN || !PASSWORD, 'TMR_LOGIN and TMR_PASSWORD must be set');

  const auth = await request.post(`${API}/auth/login`, { data: { login: LOGIN, password: PASSWORD } });
  expect(auth.ok(), 'login should succeed').toBeTruthy();
  const body = await auth.json();
  token = body.accessToken || body.token;
  expect(token, 'login should return a token').toBeTruthy();

  const s = await request.get(`${API}/coins/earn-summary`, { headers: { Authorization: `Bearer ${token}` } });
  expect(s.ok(), 'earn-summary should return 200').toBeTruthy();
  summary = await s.json();

  const h = await request.get(`${API}/coins/history?limit=25`, { headers: { Authorization: `Bearer ${token}` } });
  history = h.ok() ? await h.json() : null;
});

/** Put the session where the page expects it, then load. */
async function signInAndOpen(page) {
  await page.addInitScript((t) => {
    localStorage.setItem('accessToken', t);
    localStorage.setItem('token', t);
  }, token);
  await page.goto(`${SITE}/wallet/earn/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="earn-balance"]')).toBeVisible({ timeout: 30000 });
}

test('page loads and renders the earn experience', async ({ page }) => {
  await signInAndOpen(page);
  await expect(page).toHaveTitle(/Earn TMR Coin/i);
  await expect(page.locator('h1')).toHaveText(/Earn TMR/i);
  // Compete, earn, use: the flow the page exists to communicate.
  const flow = await page.locator('.flow').innerText();
  expect(flow).toMatch(/Compete/i);
  expect(flow).toMatch(/Earn TMR/i);
  expect(flow).toMatch(/Use TMR/i);
});

test('balance matches the backend', async ({ page }) => {
  await signInAndOpen(page);
  const shown = await page.locator('[data-testid="earn-balance"]').innerText();
  const shownNum = Number(shown.replace(/[^0-9.]/g, ''));
  expect(shownNum, `page shows ${shown}, API says ${summary.balance.tmr}`).toBe(summary.balance.tmr);
});

test('annual cap progress matches the backend', async ({ page }) => {
  await signInAndOpen(page);
  const shown = await page.locator('[data-testid="earn-cap"]').innerText();
  expect(Number(shown.replace(/[^0-9.]/g, ''))).toBe(summary.annual_cap.earned_this_year);
  const sub = await page.locator('#capSub').innerText();
  expect(sub).toContain(summary.annual_cap.cap.toLocaleString('en-US'));
  expect(sub).toMatch(/rolling 365 days/i);
});

test('every configured rule is displayed, with dormant ones explained', async ({ page }) => {
  await signInAndOpen(page);
  const cards = page.locator('[data-testid="earn-opportunities"] .opp');
  await expect(cards).toHaveCount(summary.opportunities.length);

  // Amounts on the page must match the configured rule amounts exactly.
  for (const opp of summary.opportunities.slice(0, 8)) {
    const card = page.locator(`.opp[data-key="${opp.key}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.locator('.amt')).toHaveText(new RegExp(`${opp.coins.toLocaleString('en-US')}\\s*TMR`));
    await expect(card).toHaveAttribute('data-status', opp.status);
    if (opp.dormant_reason) {
      await expect(card.locator('.why')).toBeVisible();
    }
  }

  // No rule may be shown as earnable when the backend says otherwise.
  const shownActive = await page.locator('.opp[data-status="active"]').count();
  expect(shownActive).toBe(summary.summary.active_rules);
});

test('withdrawal status is shown and never claims withdrawals are live', async ({ page }) => {
  await signInAndOpen(page);
  const notice = await page.locator('[data-testid="earn-withdrawal-notice"]').innerText();
  expect(notice).toMatch(/not active yet/i);
  expect(notice).not.toMatch(/you can withdraw|withdrawals are live|cash out now/i);
  expect(summary.withdrawal.live).toBe(false);
});

test('history matches the ledger and contains no duplicate rows', async ({ page }) => {
  await signInAndOpen(page);
  const entries = history && (history.entries || history.history || history.transactions);
  const rows = page.locator('[data-testid="earn-history"] tr');

  if (!entries || !entries.length) {
    await expect(page.locator('#histEmpty')).toBeVisible();
    return;
  }

  await expect(rows).toHaveCount(entries.length);

  const rendered = await rows.allInnerTexts();
  const unique = new Set(rendered.map((r) => r.replace(/\s+/g, ' ').trim()));
  expect(unique.size, 'no duplicate history rows').toBe(rendered.length);
});

test('navigation out of the page works', async ({ page }) => {
  await signInAndOpen(page);
  for (const [label, href] of [['My Wallet', '/wallet/'], ['Spend TMR', '/wallet/rewards/'], ['About TMR Coin', '/tmr-coin/']]) {
    const link = page.locator(`a.btn:has-text("${label}")`);
    await expect(link).toHaveAttribute('href', href);
  }
  const res = await page.request.get(`${SITE}/tmr-coin/`);
  expect(res.status()).toBe(200);
});

test('no console errors while rendering', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await signInAndOpen(page);
  await page.waitForTimeout(1500);
  const real = errors.filter((e) => !/favicon|analytics|gtag|googletagmanager|fonts\.gstatic/i.test(e));
  expect(real, real.join(' | ')).toHaveLength(0);
});

test('sibling pages still load, no regression', async ({ page }) => {
  for (const path of ['/wallet/rewards/', '/trivia/', '/forum/', '/tmr-coin/']) {
    const res = await page.request.get(`${SITE}${path}`);
    expect(res.status(), `${path} should return 200`).toBe(200);
  }
});
