#!/usr/bin/env node
'use strict';
/**
 * ADMIN_2FA_20261009: the two-factor code step in the real login pages, end to
 * end, against a LOCAL backend and a PRIVATE database. Nothing touches production.
 *
 * Run from the backend checkout (its runner creates a throwaway embedded Postgres):
 *   cd <backend with admin 2FA>      # e.g. C:/Users/BL/tmrbe-2fa-1009
 *   FRONTEND_DIR=<this repo> SCHEMA_FILE=<prod schema dump> \
 *     node scripts/run_coin_suites_locally.js <this repo>/tests/admin-2fa-login-e2e.js
 *
 * What runs: the backend's real routes/auth.js on 127.0.0.1, this repo served
 * as static files on 127.0.0.1, and headless Chromium loading the real pages.
 * Calls the pages make to trustmyrecord-api.onrender.com are answered by the
 * LOCAL backend (Playwright routing); every other outside request is blocked.
 */
const path = require('path');
const crypto = require('crypto');

const BACKEND = process.cwd();
const FRONTEND = process.env.FRONTEND_DIR;
if (!FRONTEND) { console.error('set FRONTEND_DIR'); process.exit(2); }
if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL || '')) { console.error('refusing: not a local database'); process.exit(1); }
process.env.ADMIN_TOTP_ENC_KEY = crypto.randomBytes(32).toString('hex');
delete process.env.ADMIN_2FA_ENFORCED;

// One clock for the backend and for the codes this test types.
const realNow = Date.now;
let offsetMs = 0;
Date.now = () => realNow() + offsetMs;
const nextStep = () => { offsetMs += 30 * 1000; };

const breq = (m) => require(path.join(BACKEND, m));
const express = breq('node_modules/express');
const bcrypt = breq('node_modules/bcrypt');
const jwt = breq('node_modules/jsonwebtoken');
const pool = breq('config/database');
const totp = breq('services/adminTotp');
// A fresh worktree has no node_modules; PLAYWRIGHT_DIR can point at a checkout that does.
const { chromium } = require(path.join(process.env.PLAYWRIGHT_DIR || FRONTEND, 'node_modules', 'playwright'));
const PROD_API = 'https://trustmyrecord-api.onrender.com';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' :: ' + x : '')); } };
const codeNow = (b32) => totp._internal.totp(totp._internal.base32Decode(b32), Date.now());
const listen = (app) => new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });

(async () => {
  let browser, apiSrv, webSrv;
  try {
    // ---- data --------------------------------------------------------------
    for (const col of ["account_type VARCHAR(20) DEFAULT 'real'", 'is_active BOOLEAN DEFAULT true']) await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS ' + col);
    await totp.ensureSchema();
    const PW = 'Local only pw 1!';
    const hash = await bcrypt.hash(PW, 10);
    const mk = async (name, type) => (await pool.query(
      `INSERT INTO users (username, email, password_hash, account_type, is_active, email_verified) VALUES ($1::varchar,$2::varchar,$3,$4,true,true) RETURNING id`,
      [name, `${name}@example.test`, hash, type])).rows[0].id;
    const adminId = await mk('e2e_admin', 'admin');
    await mk('e2e_member', 'real');
    const en = await totp.beginEnrollment(adminId);
    const { recoveryCodes } = await totp.confirmEnrollment(adminId, codeNow(en.secret));
    ok('test admin enrolled in two-factor', (await totp.isEnabled(adminId)) && recoveryCodes.length === 10);

    // ---- local backend: the real auth routes ---------------------------------
    const api = express();
    api.use(express.json());
    api.get('/api/health', (req, res) => res.json({ status: 'ok' }));
    api.use('/api/auth', breq('routes/auth'));
    api.use((req, res) => res.status(404).json({ error: 'not in this local test backend' }));
    apiSrv = await listen(api);
    const apiBase = `http://127.0.0.1:${apiSrv.address().port}`;

    // ---- this repo, served as static files ------------------------------------
    const web = express();
    web.use(express.static(FRONTEND, { extensions: ['html'] }));
    webSrv = await listen(web);
    const site = `http://127.0.0.1:${webSrv.address().port}`;

    browser = await chromium.launch({ headless: true });
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
    async function newPage() {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.route('**/*', async (route) => {
        // Requests still in flight when a test closes its page are dropped
        // quietly instead of crashing the run.
        try {
          const url = route.request().url();
          if (url.startsWith(site)) return await route.continue();
          if (url.startsWith(PROD_API)) {
            if (route.request().method() === 'OPTIONS') return await route.fulfill({ status: 204, headers: cors });
            const r = await route.fetch({ url: url.replace(PROD_API, apiBase) });
            return await route.fulfill({ response: r, headers: { ...r.headers(), ...cors } });
          }
          return await route.abort(); // nothing else leaves this machine
        } catch (_) { /* page closed mid request */ }
      });
      return { ctx, page };
    }
    const tokensIn = (page) => page.evaluate(() => ({
      access: localStorage.getItem('trustmyrecord_token') || localStorage.getItem('accessToken'),
      refresh: localStorage.getItem('trustmyrecord_refresh_token') || localStorage.getItem('refreshToken'),
    }));
    const mfaClaim = (t) => (t ? jwt.decode(t).mfa : undefined);
    async function fillLogin(page, login) {
      await page.goto(site + '/login/', { waitUntil: 'domcontentloaded' });
      await page.fill('#loginValue', login);
      await page.fill('#passwordValue', PW);
      await page.click('#submitBtn');
    }

    // ---- 1. /login/ page, enrolled admin, wrong code then right code ----------------
    console.log('# /login/ page: enrolled admin');
    {
      const { ctx, page } = await newPage();
      await fillLogin(page, 'e2e_admin');
      await page.waitForSelector('#tmr-2fa-dialog', { timeout: 15000 });
      ok('after the password, the two-factor dialog appears', await page.isVisible('#tmr-2fa-code'));
      ok('no session tokens exist yet', !(await tokensIn(page)).access);
      await page.screenshot({ path: path.join(process.env.SHOT_DIR || require('os').tmpdir(), 'e2e-2fa-dialog.png') });
      await page.fill('#tmr-2fa-code', '12');
      await page.click('#tmr-2fa-submit');
      ok('a malformed code is caught in the dialog', /6 digit code/.test(await page.textContent('#tmr-2fa-error')));
      nextStep();
      const wrong = codeNow(en.secret) === '000000' ? '111111' : '000000';
      await page.fill('#tmr-2fa-code', wrong);
      await page.click('#tmr-2fa-submit');
      await page.waitForFunction(() => /not right/.test((document.querySelector('#tmr-2fa-error') || {}).textContent || ''), null, { timeout: 15000 });
      ok('a wrong code shows "not right" and the dialog stays open', await page.isVisible('#tmr-2fa-code'));
      await page.fill('#tmr-2fa-code', codeNow(en.secret));
      await Promise.all([page.waitForURL(/\/profile\//, { timeout: 20000 }), page.click('#tmr-2fa-submit')]);
      const t = await tokensIn(page);
      ok('the right code signs in and lands on the profile page', /\/profile\/\?user=e2e_admin/.test(page.url()), page.url());
      ok('the stored access and refresh tokens carry mfa: true', mfaClaim(t.access) === true && mfaClaim(t.refresh) === true);
      await ctx.close();
    }

    // ---- 2. recovery code ---------------------------------------------------
    console.log('# /login/ page: recovery code');
    {
      const { ctx, page } = await newPage();
      await fillLogin(page, 'e2e_admin');
      await page.waitForSelector('#tmr-2fa-dialog', { timeout: 15000 });
      await page.fill('#tmr-2fa-code', recoveryCodes[0]);
      await Promise.all([page.waitForURL(/\/profile\//, { timeout: 20000 }), page.click('#tmr-2fa-submit')]);
      ok('a recovery code signs in', mfaClaim((await tokensIn(page)).access) === true);
      await ctx.close();
    }

    // ---- 3. cancel ---------------------------------------------------------------
    console.log('# /login/ page: cancel');
    {
      const { ctx, page } = await newPage();
      await fillLogin(page, 'e2e_admin');
      await page.waitForSelector('#tmr-2fa-dialog', { timeout: 15000 });
      await page.click('#tmr-2fa-cancel');
      await page.waitForTimeout(800);
      ok('cancel closes the dialog', !(await page.isVisible('#tmr-2fa-dialog').catch(() => false)));
      ok('cancel leaves no session and stays on /login/', !(await tokensIn(page)).access && /\/login\//.test(page.url()));
      const msg = await page.evaluate(() => document.body.innerText);
      ok('the page says the sign in was cancelled', /cancelled/i.test(msg));
      ok('the submit button is usable again', await page.isEnabled('#submitBtn'));
      await ctx.close();
    }

    // ---- 4. member without two-factor: unchanged -----------------------------------
    console.log('# /login/ page: member, no two-factor');
    {
      const { ctx, page } = await newPage();
      await fillLogin(page, 'e2e_member');
      await page.waitForURL(/\/profile\//, { timeout: 20000 });
      ok('member login goes straight through with no dialog', /\/profile\/\?user=e2e_member/.test(page.url()));
      const t = await tokensIn(page);
      ok('member tokens are stored, without an mfa claim', !!t.access && mfaClaim(t.access) === undefined);
      await ctx.close();
    }

    // ---- 5. the shared api.login path (header login, app.js, social home) -----------
    console.log('# api.login() path used by the other login forms');
    {
      const { ctx, page } = await newPage();
      await page.goto(site + '/login/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.api && typeof window.api.login === 'function');
      nextStep();
      const run = page.evaluate((pw) => window.api.login('e2e_admin', pw, true).then((d) => ({ ok: true, user: d.user && d.user.username })).catch((e) => ({ ok: false, msg: e.message })), PW);
      await page.waitForSelector('#tmr-2fa-dialog', { timeout: 15000 });
      await page.fill('#tmr-2fa-code', codeNow(en.secret));
      await page.click('#tmr-2fa-submit');
      const res = await run;
      ok('api.login asks for the code and returns the signed in user', res.ok && res.user === 'e2e_admin', JSON.stringify(res));
      ok('api.login stored mfa tokens', mfaClaim((await tokensIn(page)).access) === true);
      await ctx.close();
    }

    // ---- 6. sportsbook login helper (forms-fixed.js) -------------------------------
    console.log('# sportsbook login helper');
    {
      const { ctx, page } = await newPage();
      await page.goto(site + '/static/js/forms-fixed.js'); // file exists and parses in the browser below
      await page.goto(site + '/login/', { waitUntil: 'domcontentloaded' });
      await page.addScriptTag({ url: site + '/static/js/forms-fixed.js' });
      await page.waitForFunction(() => typeof directBackendLoginFallback === 'function' && window.api);
      nextStep();
      const run = page.evaluate((pw) => directBackendLoginFallback('e2e_admin', pw, true).then((u) => ({ ok: true, u: u && u.username })).catch((e) => ({ ok: false, msg: e.message })), PW);
      await page.waitForSelector('#tmr-2fa-dialog', { timeout: 15000 });
      await page.fill('#tmr-2fa-code', codeNow(en.secret));
      await page.click('#tmr-2fa-submit');
      const res = await run;
      ok('the sportsbook helper also completes two-factor', res.ok && mfaClaim((await tokensIn(page)).access) === true, JSON.stringify(res));
      await ctx.close();
    }
  } catch (e) {
    fail++; console.log('SUITE ERROR: ' + (e.stack || e));
  } finally {
    console.log(`\n${pass} passed, ${fail} failed`);
    if (browser) await browser.close().catch(() => {});
    if (apiSrv) apiSrv.close();
    if (webSrv) webSrv.close();
    await pool.end().catch(() => {});
    process.exit(fail ? 1 : 0);
  }
})();
