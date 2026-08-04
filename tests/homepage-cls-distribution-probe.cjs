#!/usr/bin/env node
/**
 * Homepage CLS distribution probe.
 * ---------------------------------------------------------------------------
 * A single CLS reading tells you nothing about a shift that only fires on some
 * loads. This runs N cold-cache, fresh-profile loads and reports the
 * DISTRIBUTION plus, for every layout-shift entry, which nodes moved and by how
 * much -- so an intermittent shift can be attributed instead of guessed at.
 *
 *   node tests/homepage-cls-distribution-probe.cjs --runs 30 --width 1440 \
 *        --user U --pass P --state logged-in-first
 *
 *   --state  logged-in-first | logged-in-return | logged-out
 *   --slow-auth N   delay /auth/* and /users/me by N ms
 *   --slow-api  N   delay every /api/ call by N ms
 *   --local http://127.0.0.1:PORT
 *   --json  FILE    write the raw per-run records
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const SITE = arg('--local', arg('--site', 'https://trustmyrecord.com'));
const API = 'https://trustmyrecord-api.onrender.com/api';
const RUNS = Number(arg('--runs', '30'));
const WIDTH = Number(arg('--width', '1440'));
const HEIGHT = Number(arg('--height', '900'));
const STATE = arg('--state', 'logged-in-first');
const SLOW_AUTH = Number(arg('--slow-auth', '0'));
const SLOW_API = Number(arg('--slow-api', '0'));
const SETTLE = Number(arg('--settle', '7000'));
const JSON_OUT = arg('--json', '');
const USER = arg('--user', '');
const PASS = arg('--pass', '');

/* Records every layout-shift entry with its sources, and separately tracks the
   geometry of the things most likely to be responsible, sampled at first
   contentful paint and again once settled. `sources` is what actually names the
   culprit -- the running total never does. */
const INSTRUMENT = `(() => {
  const P = window.__cls = { shifts: [], fcp: null, atPaint: null, marks: [] };
  const describe = (n) => {
    if (!n) return '?';
    if (n.nodeType !== 1) return String(n.nodeName);
    const id = n.id ? '#' + n.id : '';
    const cls = n.classList && n.classList.length ? '.' + [].slice.call(n.classList).join('.') : '';
    return (n.tagName || '') + id + cls;
  };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        P.shifts.push({
          t: Math.round(e.startTime),
          value: e.value,
          sources: (e.sources || []).map((s) => ({
            node: describe(s.node),
            from: s.previousRect ? [Math.round(s.previousRect.x), Math.round(s.previousRect.y),
                                    Math.round(s.previousRect.width), Math.round(s.previousRect.height)] : null,
            to: s.currentRect ? [Math.round(s.currentRect.x), Math.round(s.currentRect.y),
                                 Math.round(s.currentRect.width), Math.round(s.currentRect.height)] : null,
          })),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
  const SEL = {
    nav: '.ds-nav', navRight: '.ds-nav .v2nav-right', coins: '.v2nav-coins',
    ticker: '.ticker', hero: '.hero', h1: '.hero h1.hh', cta: '.hero .cta',
    spot: '.spot', avbox: '.spot .avbox', sub2: '.spot .sub2', spark: '.spot .spark',
    bridge: '.bridge', dash: '.wrap.dash', strip: '#tmr-fp-reminder',
  };
  const snap = () => {
    const o = {};
    for (const k in SEL) {
      const el = document.querySelector(SEL[k]);
      if (!el) { o[k] = null; continue; }
      const r = el.getBoundingClientRect();
      o[k] = { y: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) };
    }
    return o;
  };
  window.__snap = snap;
  try {
    new PerformanceObserver((l, obs) => {
      for (const e of l.getEntries()) {
        if (e.name !== 'first-contentful-paint') continue;
        P.fcp = Math.round(e.startTime);
        P.atPaint = snap();
        P.viewAtPaint = [window.innerWidth, window.innerHeight,
                         document.documentElement.clientWidth];
        obs.disconnect();
      }
    }).observe({ type: 'paint', buffered: true });
  } catch (e) {}
})();`;

/* Reuse a token across invocations. Logging in once per probe run is still
   enough logins to trip the auth brute-force guard when you are sweeping
   widths and states -- it locked the QA account out mid-measurement and the
   resulting 403s looked like a site defect until traced. Pass --token, or let
   this cache one. */
const TOKEN_CACHE = arg('--token-cache', '');
async function login() {
  const direct = arg('--token', '');
  if (direct) return tokenState(direct, '{}');
  if (TOKEN_CACHE && fs.existsSync(TOKEN_CACHE)) {
    try {
      const c = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
      const probe = await fetch(`${API}/picks/activation-status`, { headers: { Authorization: 'Bearer ' + c.token } });
      if (probe.ok) { console.log('  reusing cached token'); return tokenState(c.token, c.user); }
      console.log(`  cached token rejected (${probe.status}), logging in again`);
    } catch (e) {}
  }
  if (!USER || !PASS) return null;
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: USER, password: PASS }),
  });
  const d = await r.json().catch(() => null);
  const token = d && (d.token || d.accessToken || (d.data && d.data.token));
  if (!token) { console.log(`  LOGIN FAILED ${r.status}`); return null; }
  const u = JSON.stringify(d.user || {});
  if (TOKEN_CACHE) fs.writeFileSync(TOKEN_CACHE, JSON.stringify({ token, user: u }));
  return tokenState(token, u);
}

function tokenState(token, u) {
  return [
    { name: 'token', value: token }, { name: 'tmr_token', value: token },
    { name: 'trustmyrecord_token', value: token },
    { name: 'user', value: u }, { name: 'tmr_user', value: u }, { name: 'currentUser', value: u },
  ];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const creds = STATE === 'logged-out' ? null : await login();
  if (STATE !== 'logged-out' && !creds) { console.log('cannot run signed-in states without credentials'); process.exit(1); }
  const origin = new URL(SITE).origin;
  const browser = await chromium.launch();
  const records = [];

  console.log(`\nCLS distribution — ${SITE} @${WIDTH}x${HEIGHT} — ${STATE} — ${RUNS} cold runs` +
    (SLOW_AUTH ? ` — auth +${SLOW_AUTH}ms` : '') + (SLOW_API ? ` — api +${SLOW_API}ms` : ''));

  for (let i = 0; i < RUNS; i++) {
    // A brand-new context every run: fresh profile, empty cache, empty storage.
    const storageState = creds ? { cookies: [], origins: [{ origin, localStorage: creds.slice() }] } : undefined;
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, storageState });
    await ctx.addInitScript(INSTRUMENT);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/Failed to fetch|ERR_ABORTED|net::ERR_FAILED|favicon/i.test(t)) return;
      errors.push(t);
    });
    if (SLOW_AUTH) {
      await page.route('**/api/auth/**', async (r) => { await sleep(SLOW_AUTH); return r.continue(); });
      await page.route('**/api/users/me*', async (r) => { await sleep(SLOW_AUTH); return r.continue(); });
    }
    if (SLOW_API) await page.route('**/api/**', async (r) => { await sleep(SLOW_API); return r.continue(); });

    if (STATE === 'logged-in-return') {
      await page.goto(SITE, { waitUntil: 'load' });
      await page.waitForTimeout(3500);
    }
    await page.goto(SITE + (SITE.includes('?') ? '&' : '?') + 'clsrun=' + i + '_' + process.pid,
      { waitUntil: 'commit' });
    await page.waitForTimeout(SETTLE);

    const out = await page.evaluate(`(() => ({
      cls: window.__cls.shifts.reduce((a, s) => a + s.value, 0),
      shifts: window.__cls.shifts,
      fcp: window.__cls.fcp,
      atPaint: window.__cls.atPaint,
      settled: window.__snap(),
      docW: document.documentElement.scrollWidth,
      viewW: window.innerWidth,
      viewAtPaint: window.__cls.viewAtPaint || null,
      clientW: document.documentElement.clientWidth,
      early: (() => { const e = window.TMRFirstPickEarly; return e ? {
        source: e.source, deferred: e.deferred, decidedAt: e.decidedAt,
        paintedAtDecision: e.paintedAtDecision,
        hasPicks: e.status ? e.status.hasPicks : null } : null; })(),
    }))()`);
    out.errors = errors;
    records.push(out);
    await page.close(); await ctx.close();
    process.stdout.write(`\r  run ${i + 1}/${RUNS}  cls ${out.cls.toFixed(4)}        `);
  }
  await browser.close();
  process.stdout.write('\r' + ' '.repeat(46) + '\r');

  const vals = records.map((r) => r.cls).sort((a, b) => a - b);
  const pct = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  const sum = vals.reduce((a, b) => a + b, 0);
  console.log(`\n  CLS over ${RUNS} runs`);
  console.log(`    min ${vals[0].toFixed(4)}   p50 ${pct(0.5).toFixed(4)}   p90 ${pct(0.9).toFixed(4)}   max ${vals[vals.length - 1].toFixed(4)}   mean ${(sum / vals.length).toFixed(4)}`);
  const over = (t) => records.filter((r) => r.cls > t).length;
  console.log(`    runs > 0.01: ${over(0.01)}   > 0.05: ${over(0.05)}   > 0.1: ${over(0.1)}`);

  // Attribute: which node, across all runs, contributed the most total shift.
  const byNode = new Map();
  for (const r of records) {
    for (const s of r.shifts) {
      for (const src of (s.sources.length ? s.sources : [{ node: '(no source reported)' }])) {
        const cur = byNode.get(src.node) || { total: 0, count: 0, worst: 0, sample: null };
        cur.total += s.value / (s.sources.length || 1);
        cur.count += 1;
        if (s.value > cur.worst) { cur.worst = s.value; cur.sample = { t: s.t, from: src.from, to: src.to }; }
        byNode.set(src.node, cur);
      }
    }
  }
  console.log(`\n  shift sources, ranked by total contribution`);
  [...byNode.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 12).forEach(([node, v]) => {
    const s = v.sample;
    const move = s && s.from && s.to
      ? `  y ${s.from[1]}->${s.to[1]}  h ${s.from[3]}->${s.to[3]}  @${s.t}ms` : '';
    console.log(`    ${v.total.toFixed(4)}  x${v.count}  ${node}${move}`);
  });

  // Geometry deltas between first paint and settled, averaged over runs.
  console.log(`\n  first paint -> settled, elements that changed (runs affected / ${RUNS})`);
  const keys = Object.keys(records[0].settled);
  const deltas = {};
  for (const r of records) {
    if (!r.atPaint) continue;
    for (const k of keys) {
      const a = r.atPaint[k], b = r.settled[k];
      if (!a || !b) { if (!!a !== !!b) { deltas[k] = deltas[k] || { runs: 0, dy: [], dh: [], appeared: 0 }; deltas[k].appeared++; } continue; }
      if (a.y === b.y && a.h === b.h) continue;
      deltas[k] = deltas[k] || { runs: 0, dy: [], dh: [], appeared: 0 };
      deltas[k].runs++; deltas[k].dy.push(b.y - a.y); deltas[k].dh.push(b.h - a.h);
    }
  }
  const rng = (a) => a.length ? `${Math.min(...a)}..${Math.max(...a)}` : '-';
  Object.entries(deltas).sort((a, b) => (b[1].runs + b[1].appeared) - (a[1].runs + a[1].appeared)).forEach(([k, v]) => {
    console.log(`    ${k.padEnd(10)} moved in ${v.runs}${v.appeared ? ` (+${v.appeared} appeared late)` : ''}  dy ${rng(v.dy)}  dh ${rng(v.dh)}`);
  });
  if (!Object.keys(deltas).length) console.log('    nothing changed after first paint');

  const withErrors = records.filter((r) => r.errors.length);
  console.log(`\n  console errors in ${withErrors.length}/${RUNS} runs` +
    (withErrors.length ? `: ${withErrors[0].errors.slice(0, 2).join(' | ').slice(0, 160)}` : ''));
  const overflow = records.filter((r) => r.docW > r.viewW).length;
  console.log(`  horizontal overflow in ${overflow}/${RUNS} runs`);

  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(records, null, 1)); console.log(`  raw records -> ${JSON_OUT}`); }
})();
