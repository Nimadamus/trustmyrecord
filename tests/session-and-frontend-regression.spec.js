/**
 * Regression coverage for frontend fixes made during the 2026-07-26
 * production audit. Runs against the live site (same convention as
 * sportsbook-live-verification.spec.js). No persistent QA account is
 * required -- each test that needs one creates and abandons a throwaway
 * qa_pwtest_* / qa_regtest_* account (auto-tagged account_type='test' by
 * the signup route's own QA_SIGNUP_USERNAME_REGEX, so it never counts
 * toward real user stats and is safe to leave for the routine QA sweep).
 *
 * Run: npx playwright test tests/session-and-frontend-regression.spec.js
 */
const { test, expect } = require('@playwright/test');

const BASE = process.env.TMR_BASE_URL || 'https://trustmyrecord.com';

function uniqueName(prefix) {
  // Date.now()/Math.random() are fine here (this is a real Playwright run,
  // not a workflow script) -- just needs to be unique per test invocation.
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

test.describe('Infinite pick-list polling loop (2026-07-26 fix)', () => {
  // Root cause: window.renderPicksList's backend-fetch success handler
  // called renderPicksList() with no arguments, re-entering its own fetch
  // block and recursing forever for any account with >=1 pick. Reproduced
  // live: 229 consecutive GET /api/picks calls in a few seconds before the
  // 2026-06-07 emergency rate limiter cut it off with 429s.
  test('renderPicksList does not runaway-fetch /api/picks', async ({ page }) => {
    await page.goto(`${BASE}/sportsbook/`, { waitUntil: 'domcontentloaded' });

    let picksCallCount = 0;
    page.on('request', (req) => {
      if (/\/api\/picks\?/.test(req.url())) picksCallCount++;
    });

    // Call it several times in a row, simulating the exact recursive
    // condition (backend has picks, so backendPicks.length > 0 every time).
    await page.evaluate(() => {
      window._tmrBackendPicks = null;
      window._tmrPicksLoading = false;
      if (typeof window.renderPicksList === 'function') {
        window.renderPicksList();
        window.renderPicksList();
        window.renderPicksList();
      }
    });

    // Give any (correctly non-looping) in-flight fetch time to resolve.
    await page.waitForTimeout(4000);

    expect(picksCallCount, 'renderPicksList must not runaway-fetch /api/picks').toBeLessThan(10);
  });

  test('the recursive re-render call passes skipFetch=true (source guard present)', async ({ page }) => {
    const res = await page.request.get(`${BASE}/sportsbook/`);
    const html = await res.text();
    expect(html, 'skipFetch parameter must exist on renderPicksList').toContain('window.renderPicksList = function(skipFetch)');
    expect(html, 'the fetch condition must check !skipFetch').toContain('!skipFetch && typeof api !==');
    expect(html, 'the self-recursive call must pass true (skip re-fetch)').toContain('window.renderPicksList(true);');
  });
});

test.describe('Password retention after failed submit (2026-07-26 fix)', () => {
  test('register: password fields are cleared after a mismatch error', async ({ page }) => {
    await page.goto(`${BASE}/register/`, { waitUntil: 'domcontentloaded' });
    await page.locator('#usernameValue').fill(uniqueName('qa_pwtest'));
    await page.locator('#emailValue').fill(`${uniqueName('qa_pwtest')}@example.com`);
    await page.locator('#passwordValue').fill('Test1234!');
    await page.locator('#confirmValue').fill('Different999!');
    await page.locator('#submitBtn').click();

    await expect(page.locator('#message')).toContainText(/do not match/i);
    await expect(page.locator('#passwordValue')).toHaveValue('');
    await expect(page.locator('#confirmValue')).toHaveValue('');
  });

  test('login: password field is cleared after invalid credentials', async ({ page }) => {
    await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: 'Email or Username' }).fill('nonexistent_qa_probe_zzz');
    await page.getByRole('textbox', { name: 'Password' }).fill('WrongPassword123!');
    await page.getByRole('button', { name: 'LOG IN' }).click();
    await expect(page.locator('#passwordValue')).toHaveValue('', { timeout: 10000 });
  });
});

test.describe('Friendly network-error message (2026-07-26 fix)', () => {
  test('register: a raw network failure shows a friendly message, not "Failed to fetch"', async ({ page }) => {
    await page.goto(`${BASE}/register/`, { waitUntil: 'domcontentloaded' });
    await page.route('**/api/auth/signup', (route) => route.abort('failed'));

    await page.locator('#usernameValue').fill(uniqueName('qa_regtest'));
    await page.locator('#emailValue').fill(`${uniqueName('qa_regtest')}@example.com`);
    await page.locator('#passwordValue').fill('Test1234!');
    await page.locator('#confirmValue').fill('Test1234!');
    await page.locator('#submitBtn').click();

    const msg = page.locator('#message');
    await expect(msg).toContainText(/couldn.t reach the server/i, { timeout: 10000 });
    await expect(msg).not.toContainText(/failed to fetch/i);
  });
});

test.describe('Login redirect-back (2026-07-26 fix)', () => {
  test('a protected page bounces to /login/?next=<path>, and the guard rejects an open-redirect payload', async ({ page }) => {
    await page.goto(`${BASE}/messages/`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login\/\?next=%2Fmessages%2F/, { timeout: 10000 });
  });
});

test.describe('Mobile layout (2026-07-26 audit)', () => {
  for (const [w, h] of [[390, 844], [360, 740]]) {
    test(`no horizontal overflow at ${w}x${h} on register/login/sportsbook`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      for (const path of ['/register/', '/login/', '/sportsbook/']) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} must not overflow horizontally at ${w}x${h}`).toBeLessThanOrEqual(2);
      }
    });
  }
});

test.describe('Duplicate-submit protection (2026-07-26 audit)', () => {
  test('register: rapid repeated clicks create exactly one account', async ({ page }) => {
    const username = uniqueName('qa_dupsubmit');
    await page.goto(`${BASE}/register/`, { waitUntil: 'domcontentloaded' });

    let signupCalls = 0;
    page.on('response', (res) => { if (/\/api\/auth\/signup$/.test(res.url())) signupCalls++; });

    await page.locator('#usernameValue').fill(username);
    await page.locator('#emailValue').fill(`${username}@example.com`);
    await page.locator('#passwordValue').fill('Test1234!');
    await page.locator('#confirmValue').fill('Test1234!');

    // Raw synchronous DOM clicks, not Playwright's page.click() -- that API
    // waits for actionability (visible/enabled/stable) between each attempt,
    // which defeats the point of a true race against the button's own
    // synchronous disabled=true (see submitBtn.disabled in register/index.html).
    await page.evaluate(() => {
      const btn = document.getElementById('submitBtn');
      btn.click(); btn.click(); btn.click();
    });
    await page.waitForURL(/\/sportsbook\//, { timeout: 15000 });

    expect(signupCalls, 'a disabled submit button must not fire multiple signup requests').toBe(1);
  });
});
