import { chromium, request as pwRequest } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAutomationAccount } from './helpers/automationAccount.mjs';

/**
 * Sign in ONCE per role and save the session for the whole live suite.
 *
 * The suite logged in inside every test, which is 16 logins across two
 * projects. TrustMyRecord's auth route rate-limits at 15 attempts per IP per
 * window (deliberately — `auth-bruteforce-guard-test.js` asserts exactly that),
 * so the sixteenth test failed with a console that never mounted, which reads
 * as a broken product rather than a throttled test run. It was the SIXTEENTH,
 * every time.
 *
 * Two logins now, reused as storage state. That also removes the login form
 * from the critical path of tests that are not about logging in — the gate
 * itself is still exercised, by the logged-out persona, from a clean context.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const STATE_DIR = path.join(HERE, '..', '..', 'artifacts', 'blp-live-state');
export const SUB_STATE = path.join(STATE_DIR, 'subscriber.json');
export const FREE_STATE = path.join(STATE_DIR, 'free.json');

/**
 * Identity of the free-tier fixture for this run, written by globalSetup and
 * read by both the spec (which needs the username) and globalTeardown (which
 * deletes it). `ephemeral: true` means this run created it and this run owns
 * removing it; a username supplied via BLP_LIVE_FREE_USER is never touched.
 */
export const FREE_ACCOUNT_FILE = path.join(STATE_DIR, 'free-account.json');

export function readFreeAccount() {
  try { return JSON.parse(fs.readFileSync(FREE_ACCOUNT_FILE, 'utf8')); } catch { return null; }
}

const SITE = process.env.BLP_LIVE_SITE || 'https://trustmyrecord.com';

async function signIn(browser, creds, file) {
  if (!creds.user) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${SITE}/login/?next=/betlegend-pro/app/`);
  await page.locator('input[type=text]').first().fill(creds.user);
  await page.locator('input[type=password]').first().fill(creds.pass);
  await page.getByRole('button', { name: /log in/i }).click();

  const denied = page.getByText(/too many login attempts/i);
  await Promise.race([
    page.waitForURL(/betlegend-pro\/app/, { timeout: 60000 }),
    denied.waitFor({ timeout: 60000 }).then(() => {
      throw new Error(`login for ${creds.user} was rate-limited — wait a few minutes and re-run`);
    }),
  ]);
  // Wait for the console to mount, so a saved state is a state that works.
  await page.waitForSelector('#app', { state: 'visible', timeout: 60000 });
  await context.storageState({ path: file });
  await context.close();
}

/**
 * The free-tier fixture.
 *
 * This suite used to require BLP_LIVE_FREE_USER to name an account somebody had
 * registered by hand. That is what produced user 2136 `ledgercheck_mv7`: a
 * plain member, indistinguishable from a human, which production counted in its
 * member totals, its Newest Member widget, its activity strip and its /u/ SEO
 * bake for a day before it was purged.
 *
 * So the run now MAKES its own, through helpers/automationAccount.mjs, which
 * sends `X-TMR-Automation`. The BEFORE trigger `trg_users_automation_guard`
 * forces `is_internal_test = true` inside the same INSERT, so the account is
 * excluded from every one of those surfaces from the instant it exists -- there
 * is no window in which it could be counted. globalTeardown then deletes it.
 *
 * BLP_LIVE_FREE_USER still works and takes precedence, for a long-lived fixture
 * you have deliberately provisioned. It is treated as borrowed, never deleted.
 */
async function resolveFreeAccount() {
  if (process.env.BLP_LIVE_FREE_USER) {
    return {
      user: process.env.BLP_LIVE_FREE_USER,
      pass: process.env.BLP_LIVE_FREE_PASS,
      ephemeral: false,
    };
  }
  const api = await pwRequest.newContext();
  try {
    const acct = await createAutomationAccount(api, {
      origin: 'playwright:betlegend-pro-live.spec.mjs:free-persona',
      prefix: 'qa_blplive_',
    });
    console.log(`[blp-live] created ephemeral free fixture ${acct.username} (id ${acct.userId}) — deleted in teardown`);
    return { user: acct.username, pass: acct.password, userId: acct.userId, ephemeral: true };
  } finally {
    await api.dispose();
  }
}

export default async function globalSetup() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // Empty states so `test.use({ storageState })` resolves even for a role with
  // no credentials; those tests skip on the missing env var anyway.
  for (const file of [SUB_STATE, FREE_STATE]) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ cookies: [], origins: [] }));
  }
  // Stale identity from a previous run must never survive into this one, or
  // teardown could delete an account this run does not own.
  fs.rmSync(FREE_ACCOUNT_FILE, { force: true });

  const free = await resolveFreeAccount();
  fs.writeFileSync(FREE_ACCOUNT_FILE, JSON.stringify(free, null, 1));

  const browser = await chromium.launch();
  try {
    await signIn(browser, { user: process.env.BLP_LIVE_SUB_USER, pass: process.env.BLP_LIVE_SUB_PASS }, SUB_STATE);
    await signIn(browser, { user: free.user, pass: free.pass }, FREE_STATE);
  } finally {
    await browser.close();
  }
}
