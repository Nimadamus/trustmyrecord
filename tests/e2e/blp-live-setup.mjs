import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

export default async function globalSetup() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // Empty states so `test.use({ storageState })` resolves even for a role with
  // no credentials; those tests skip on the missing env var anyway.
  for (const file of [SUB_STATE, FREE_STATE]) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ cookies: [], origins: [] }));
  }

  const browser = await chromium.launch();
  try {
    await signIn(browser, { user: process.env.BLP_LIVE_SUB_USER, pass: process.env.BLP_LIVE_SUB_PASS }, SUB_STATE);
    await signIn(browser, { user: process.env.BLP_LIVE_FREE_USER, pass: process.env.BLP_LIVE_FREE_PASS }, FREE_STATE);
  } finally {
    await browser.close();
  }
}
