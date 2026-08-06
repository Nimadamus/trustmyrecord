#!/usr/bin/env node
/**
 * LIVE PROOF — /u/<username>/ profile boot (2026-08-06)
 *
 * Loads real public profile pages in a real browser and fails if a visitor could
 * see any of the symptoms this fix was written for:
 *
 *   - "Uncaught SyntaxError: Identifier 'TrustMyRecordAPI' has already been declared"
 *   - any other uncaught page error
 *   - the same JS bundle requested more than once in a single page load
 *   - the stale baked SEO snapshot visible at any point before the live app
 *   - a "Loading verified metrics..." state that never resolves
 *
 * It also freezes the swap (by stalling /profile/) to inspect the state a visitor
 * actually sees WHILE the live profile loads: it must be the branded skeleton with
 * the baked snapshot hidden, never stale numbers.
 *
 * Run after a deploy:
 *   node tests/profile-boot-live-proof.cjs
 *   node tests/profile-boot-live-proof.cjs --base http://127.0.0.1:8899 --users BetLegend,Little_Venom
 */
'use strict';

const { chromium } = require('@playwright/test');

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const BASE = argOf('--base', 'https://trustmyrecord.com').replace(/\/$/, '');
const USERS = argOf('--users', 'BetLegend,Little_Venom').split(',').map((s) => s.trim()).filter(Boolean);
const METRICS_BUDGET_MS = Number(argOf('--metrics-budget', '12000'));

// GET /api/marketplace/storefront/:user answers 404 for a member with no
// storefront, and the browser logs every 404 as a console error regardless of how
// the caller handles it. Pre-existing and identical on /profile/?user=; not this
// fix's to assert on.
const IGNORED_CONSOLE = [/marketplace\/storefront/];

const failures = [];
const note = (m) => console.log('  ' + m);
function expect(ok, message) {
  if (ok) { console.log('  PASS  ' + message); return; }
  failures.push(message);
  console.error('  FAIL  ' + message);
}

async function visit(browser, url, { stallShell = false } = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const jsRequests = [];

  page.on('pageerror', (e) => pageErrors.push(String(e && e.message)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const where = (m.location() && m.location().url) || '';
    if (IGNORED_CONSOLE.some((re) => re.test(where) || re.test(m.text()))) return;
    consoleErrors.push(m.text());
  });
  page.on('request', (r) => {
    const u = r.url();
    if (/\.js(\?|$)/.test(u) && !/googletagmanager|google-analytics/.test(u)) jsRequests.push(u);
  });

  if (stallShell) {
    await page.route('**/profile/', async (route) => { await page.waitForTimeout(15000); await route.abort(); });
  }

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Sample continuously: any stale baked text becoming visible at ANY moment is a failure.
  let sawStaleSnapshot = false;
  let metricsSettledMs = null;
  const deadline = Date.now() + (stallShell ? 2500 : METRICS_BUDGET_MS);
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const main = document.querySelector('main.u-wrap');
      const boot = document.getElementById('tmrUBoot');
      const status = document.getElementById('profileAdvancedMetricsStatus');
      return {
        bakedVisible: !!main && getComputedStyle(main).visibility !== 'hidden',
        swapped: !!document.getElementById('profileHeader'),
        bootVisible: !!boot && getComputedStyle(boot).display !== 'none',
        metricsPending: !!status && /Loading verified metrics/.test(status.textContent || ''),
        hasStatus: !!status,
      };
    }).catch(() => null);
    if (!s) { await page.waitForTimeout(120); continue; }   // mid-swap: context torn down
    if (s.bakedVisible && !s.swapped) sawStaleSnapshot = true;
    if (metricsSettledMs === null && s.swapped && s.hasStatus && !s.metricsPending) {
      metricsSettledMs = Date.now() - t0;
    }
    if (metricsSettledMs !== null && !stallShell) break;
    await page.waitForTimeout(150);
  }

  const final = await page.evaluate(() => {
    const boot = document.getElementById('tmrUBoot');
    const main = document.querySelector('main.u-wrap');
    const status = document.getElementById('profileAdvancedMetricsStatus');
    return {
      swapped: !!document.getElementById('profileHeader'),
      bootVisible: !!boot && getComputedStyle(boot).display !== 'none',
      bakedVisible: !!main && getComputedStyle(main).visibility !== 'hidden',
      metricsStatus: status ? (status.textContent || '').trim() : '(rendered)',
      executedScriptsOnBakedPage: [...document.querySelectorAll('script[src]')].map((s) => s.src),
    };
  });

  const counts = jsRequests.reduce((m, u) => { m[u] = (m[u] || 0) + 1; return m; }, {});
  const duplicates = Object.entries(counts).filter(([, n]) => n > 1).map(([u, n]) => `${n}x ${u}`);

  // Drop the stalling route before teardown, or its pending handler rejects
  // against a closed page and takes the process down.
  if (stallShell) await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
  return { pageErrors, consoleErrors, duplicates, sawStaleSnapshot, metricsSettledMs, final };
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const user of USERS) {
      const url = `${BASE}/u/${encodeURIComponent(user)}/`;
      console.log(`\n== ${url}`);

      const r = await visit(browser, url);
      expect(!r.pageErrors.some((m) => /already been declared/i.test(m)),
        `${user}: no "TrustMyRecordAPI has already been declared" error`);
      expect(r.pageErrors.length === 0, `${user}: no uncaught page errors` +
        (r.pageErrors.length ? ' — ' + r.pageErrors.join(' | ') : ''));
      expect(r.consoleErrors.length === 0, `${user}: no console errors` +
        (r.consoleErrors.length ? ' — ' + r.consoleErrors.slice(0, 3).join(' | ') : ''));
      expect(r.duplicates.length === 0, `${user}: no duplicate JS bundle requests` +
        (r.duplicates.length ? ' — ' + r.duplicates.join(', ') : ''));
      expect(!r.sawStaleSnapshot, `${user}: the stale baked snapshot was never visible`);
      expect(r.final.swapped, `${user}: the live profile app is mounted at the /u/ URL`);
      expect(!r.final.bootVisible, `${user}: the loading skeleton is gone once the app is up`);
      expect(!/Loading verified metrics/.test(r.final.metricsStatus),
        `${user}: metrics resolved ("${r.final.metricsStatus}")`);
      if (r.metricsSettledMs !== null) note(`metrics settled in ${r.metricsSettledMs}ms`);

      // What does the visitor see WHILE the swap is in flight?
      const s = await visit(browser, url, { stallShell: true });
      expect(s.final.bootVisible, `${user}: mid-swap shows the branded loading skeleton`);
      expect(!s.final.bakedVisible, `${user}: mid-swap hides the stale baked snapshot`);
      expect(s.final.executedScriptsOnBakedPage.every((u) => /tmr-profile-hydrate\./.test(u)),
        `${user}: the baked page executes only the hydrate script` +
        ' — ' + s.final.executedScriptsOnBakedPage.map((u) => u.split('/').pop()).join(', '));
    }
  } finally {
    await browser.close();
  }

  console.log(failures.length === 0
    ? '\nprofile-boot-live-proof: all checks passed'
    : `\nprofile-boot-live-proof: ${failures.length} check(s) FAILED`);
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
