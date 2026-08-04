#!/usr/bin/env node
/**
 * Reminder-strip layout-shift probe.
 * ---------------------------------------------------------------------------
 * Isolates the signed-in "Your record is waiting" strip and answers three
 * questions that a raw CLS number cannot:
 *
 *   1. WHEN does #tmr-fp-reminder enter the document, relative to first paint?
 *   2. WHICH elements move when it does (layout-shift `sources` attribution)?
 *   3. HOW MUCH does each homepage anchor move?
 *
 * It can drive the real signed-in account or synthesise any eligibility state
 * by intercepting GET /picks/activation-status, so eligible / ineligible /
 * slow-auth / slow-eligibility / API-failure are all reproducible offline.
 *
 *   node tests/reminder-strip-cls-probe.cjs --site https://trustmyrecord.com \
 *        --user U --pass P --widths 320,360,390,430 --case eligible
 *
 *   --case  eligible | ineligible | slow-elig | slow-auth | fail | live
 *   --local http://127.0.0.1:PORT   (test a working tree instead of prod)
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const SITE = arg('--local', arg('--site', 'https://trustmyrecord.com'));
const API = 'https://trustmyrecord-api.onrender.com/api';
const USER = arg('--user', '');
const PASS = arg('--pass', '');
const CASE = arg('--case', 'live');
const WIDTHS = arg('--widths', '320,360,390,430').split(',').map(Number);
const SETTLE = Number(arg('--settle', 6000));
const OUT = arg('--out', '');

const ANCHORS = {
  nav: '.ds-nav',
  ticker: '.ticker',
  'hero eyebrow': '.eyebrow',
  'hero headline': '.hero h1.hh',
  'CTA buttons': '.hero .cta',
  'capper card': '.spot',
  'stats stripe': '.bridge',
  'section below hero': '.wrap.dash',
};

// Injected before any page script. Records layout shifts with attribution and
// the exact moment the strip lands, so "it shifted" can be traced to a cause.
const INSTRUMENT = `(() => {
  window.__probe = { shifts: [], strip: null, fcp: null, paints: [] };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__probe.shifts.push({
          t: Math.round(e.startTime),
          value: e.value,
          sources: (e.sources || []).map((s) => {
            const n = s.node;
            if (!n) return '?';
            const tag = n.tagName || n.nodeName;
            const id = n.id ? '#' + n.id : '';
            const cls = n.classList && n.classList.length ? '.' + n.classList[0] : '';
            const from = s.previousRect, to = s.currentRect;
            return tag + id + cls + ' ' + Math.round(from.y) + '->' + Math.round(to.y);
          }),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__probe.paints.push({ name: e.name, t: Math.round(e.startTime) });
        if (e.name === 'first-contentful-paint' && window.__probe.fcp === null) {
          window.__probe.fcp = Math.round(e.startTime);
        }
      }
    }).observe({ type: 'paint', buffered: true });
  } catch (e) {}
  // Catch the strip the instant it is inserted, wherever it is inserted.
  // documentElement does not exist yet when an init script runs, so the
  // observer has to be armed on the first tick that has a root to watch --
  // arming it late is how an earlier version of this probe reported
  // "never rendered" for a strip that was plainly on the page.
  window.__probe.armed = false;
  const note = () => {
    const el = document.getElementById('tmr-fp-reminder');
    if (!el || window.__probe.strip) return !!el;
    const r = el.getBoundingClientRect();
    window.__probe.strip = {
      t: Math.round(performance.now()),
      h: Math.round(r.height),
      top: Math.round(r.top),
      readyState: document.readyState,
      // The question that decides whether this shifts the page or not.
      afterFcp: performance.getEntriesByName('first-contentful-paint').length > 0,
    };
    return true;
  };
  const arm = () => {
    if (window.__probe.armed || !document.documentElement) return;
    window.__probe.armed = true;
    try {
      const mo = new MutationObserver(() => { if (note()) mo.disconnect(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      note();
    } catch (e) {}
  };
  arm();
  if (!window.__probe.armed) {
    const iv = setInterval(() => { arm(); if (window.__probe.armed) clearInterval(iv); }, 0);
  }
  // Snapshot every anchor at the exact frame after first contentful paint.
  // Anything measured before that cannot have shifted anything, because
  // nothing was on screen to shift.
  window.__probe.atPaint = null;
  const ANCH = ${JSON.stringify(Object.entries(ANCHORS))};
  const snap = () => {
    const out = {};
    ANCH.forEach(([n, s]) => {
      const el = document.querySelector(s);
      out[n] = el ? Math.round(el.getBoundingClientRect().top) : null;
    });
    return out;
  };
  try {
    new PerformanceObserver((l, obs) => {
      for (const e of l.getEntries()) {
        if (e.name !== 'first-contentful-paint') continue;
        window.__probe.atPaint = snap();
        window.__probe.stripAtPaint = !!document.getElementById('tmr-fp-reminder');
        obs.disconnect();
      }
    }).observe({ type: 'paint', buffered: true });
  } catch (e) {}
})();`;

async function login() {
  if (!USER || !PASS) return null;
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: USER, password: PASS }),
  });
  const d = await r.json().catch(() => null);
  const token = d && (d.token || d.accessToken || (d.data && d.data.token));
  if (!token) { console.log(`  LOGIN FAILED (${r.status})`); return null; }
  const user = JSON.stringify(d.user || {});
  return {
    cookies: [],
    origins: [{ origin: new URL(SITE).origin, localStorage: [
      { name: 'token', value: token },
      { name: 'tmr_token', value: token },
      { name: 'trustmyrecord_token', value: token },
      { name: 'user', value: user },
      { name: 'tmr_user', value: user },
      { name: 'currentUser', value: user },
    ] }],
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function applyCase(page) {
  if (CASE === 'live') return;
  const DELAY = Number(arg('--elig-delay', '0'));
  await page.route('**/picks/activation-status*', async (route) => {
    if (DELAY) await sleep(DELAY);
    if (CASE === 'slow-elig') await sleep(2500);
    if (CASE === 'fail') return route.fulfill({ status: 500, body: '{"error":"boom"}' });
    const hasPicks = CASE === 'ineligible';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ userId: 1502, pickCount: hasPicks ? 7 : 0, hasPicks }),
    });
  });
  if (CASE === 'slow-auth') {
    await page.route('**/auth/me*', async (route) => { await sleep(2500); return route.continue(); });
    await page.route('**/users/me*', async (route) => { await sleep(2500); return route.continue(); });
  }
}

async function measure(browser, width, storageState, label) {
  // --twice models the promise the deferred path makes: the answer that lost
  // the race to first paint is cached, so the NEXT view must paint the strip
  // during parse. Both loads share one context, so localStorage carries over.
  const TWICE = argv.includes('--twice');
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
    storageState: storageState || undefined,
  });
  await ctx.addInitScript(INSTRUMENT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to fetch|ERR_ABORTED|net::ERR_FAILED/i.test(t)) return;
    errors.push(t);
  });
  await applyCase(page);

  if (TWICE) {
    await page.goto(SITE, { waitUntil: 'load' });
    await page.waitForTimeout(3000);          // let the answer land and cache
    await page.evaluate('window.__probe = { shifts: [], strip: null, fcp: null, paints: [] }');
  }

  await page.goto(SITE + (SITE.includes('?') ? '&' : '?') + 'probe=' + Date.now(),
    { waitUntil: 'commit' });

  // First reading as close to first paint as we can get.
  await page.waitForTimeout(120);
  const early = await page.evaluate(`(() => {
    const out = {};
    ${JSON.stringify(Object.entries(ANCHORS))}.forEach(([n, s]) => {
      const el = document.querySelector(s);
      out[n] = el ? Math.round(el.getBoundingClientRect().top) : null;
    });
    return out;
  })()`);

  await page.waitForTimeout(SETTLE);

  const late = await page.evaluate(`(() => {
    const out = { anchors: {}, probe: window.__probe, cls: 0 };
    ${JSON.stringify(Object.entries(ANCHORS))}.forEach(([n, s]) => {
      const el = document.querySelector(s);
      out.anchors[n] = el ? Math.round(el.getBoundingClientRect().top) : null;
    });
    out.cls = window.__probe.shifts.reduce((a, s) => a + s.value, 0);
    const strip = document.getElementById('tmr-fp-reminder');
    out.stripNow = strip ? (() => { const r = strip.getBoundingClientRect();
      return { h: Math.round(r.height), top: Math.round(r.top), w: Math.round(r.width) }; })() : null;
    out.docW = document.documentElement.scrollWidth;
    out.viewW = window.innerWidth;
    const e = window.TMRFirstPickEarly;
    out.early = e ? { ran: e.ran, signedIn: e.signedIn, source: e.source, deferred: e.deferred,
                      decidedAt: e.decidedAt, paintedAtDecision: e.paintedAtDecision,
                      hasPicks: e.status ? e.status.hasPicks : null } : null;
    // Clipping check: does any strip child overflow the strip's own box?
    if (strip) {
      const sr = strip.getBoundingClientRect();
      out.clipped = [].slice.call(strip.children).filter((c) => {
        const r = c.getBoundingClientRect();
        return r.right > sr.right + 1 || r.bottom > sr.bottom + 1 || r.left < sr.left - 1;
      }).map((c) => c.className || c.tagName);
    }
    return out;
  })()`);

  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `${label}-${width}.png`) });
  }
  await page.close();
  await ctx.close();

  // The comparison that matters is post-paint. Anything that settles before
  // first contentful paint is invisible to the visitor by definition.
  const base = late.probe.atPaint || early;
  const moved = [];
  for (const k of Object.keys(ANCHORS)) {
    const a = base[k], b = late.anchors[k];
    if (a === null || a === undefined || b === null) continue;
    if (Math.abs(a - b) > 1) moved.push(`${k} ${a}->${b}`);
  }
  return { width, early, late, moved, errors };
}

(async () => {
  const storageState = await login();
  const browser = await chromium.launch();
  console.log(`\nreminder-strip probe — ${SITE} — case=${CASE} — ${storageState ? 'SIGNED IN' : 'signed out'}`);
  let worst = 0;
  let anyShiftFromStrip = false;
  for (const w of WIDTHS) {
    const r = await measure(browser, w, storageState, `${CASE}`);
    const p = r.late.probe;
    worst = Math.max(worst, r.late.cls);
    const stripShifts = p.shifts.filter((s) => s.value > 0.001);
    if (p.strip && stripShifts.length) anyShiftFromStrip = true;
    console.log(`\n  @${w}px  CLS ${r.late.cls.toFixed(4)}  fcp ${p.fcp}ms`);
    console.log(`    strip: ${p.strip
      ? `landed @${p.strip.t}ms h=${p.strip.h}px readyState=${p.strip.readyState} AFTER-FCP=${p.strip.afterFcp}`
      : 'never rendered'}   inFirstPaint=${p.stripAtPaint === true}`);
    console.log(`    now  : ${r.late.stripNow ? `h=${r.late.stripNow.h} w=${r.late.stripNow.w} top=${r.late.stripNow.top}` : 'absent'}`);
    const e = r.late.early;
    console.log(`    gate : ${e ? `signedIn=${e.signedIn} source=${e.source} deferred=${e.deferred} ` +
      `hasPicks=${e.hasPicks} decidedAt=${e.decidedAt}ms paintedAtDecision=${e.paintedAtDecision}` : 'early block absent'}`);
    console.log(`    overflow: doc ${r.late.docW} vs view ${r.late.viewW}${r.late.docW > r.late.viewW ? '  <== HORIZONTAL OVERFLOW' : ''}` +
      (r.late.clipped && r.late.clipped.length ? `  CLIPPED: ${r.late.clipped.join(',')}` : ''));
    if (r.moved.length) console.log(`    MOVED: ${r.moved.join(' | ')}`);
    else console.log('    MOVED: nothing');
    stripShifts.forEach((s) => console.log(`    shift @${s.t}ms ${s.value.toFixed(4)} <- ${s.sources.join(' , ')}`));
    if (r.errors.length) console.log(`    CONSOLE ERRORS: ${r.errors.slice(0, 4).join(' | ')}`);
  }
  await browser.close();
  console.log(`\n  worst CLS across widths: ${worst.toFixed(4)}${anyShiftFromStrip ? '' : '  (no strip-attributed shift)'}\n`);
})();
