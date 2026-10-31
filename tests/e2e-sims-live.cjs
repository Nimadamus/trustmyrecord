#!/usr/bin/env node
'use strict';
/**
 * e2e-sims-live.cjs -- the visitor's view of every TMR simulator, against the LIVE site.
 *                                                                    E2E_SIMS_LIVE_20261030
 * Covers MLB, NFL, NBA and NHL at a desktop (1366x900) and a phone (390x844) width:
 *   A. page smoke: HTTP 200, no console errors, no failed first party requests, no
 *      horizontal scroll, no impossible values (NaN / undefined / [object Object]),
 *      offseason banner (MLB), logged out messaging
 *   B. every same-site link on the simulator pages returns 200
 *   C. controls: team / pitcher / goalie pickers, mode and venue toggles
 *   D. one simulation per sport per device. Box scores must reconcile: team totals
 *      equal player sums, the linescore equals the final, the recap agrees, the
 *      scoring summary / play by play ends on the final score.
 *   E. shared result links select the matchup but never run it on load
 *   F. season and playoff pages: probabilities inside 0..100, league sums that must
 *      hold (one champion, N playoff teams), rounds that can only shrink
 *
 * FRUGAL WITH REAL RUNS. A real run on the live API is archived publicly, so only the
 * desktop run of each sport hits it (4 per pass, --real-runs=N to change). The phone
 * run replays the desktop response through page.route, which still exercises the
 * whole phone rendering path. The MLB engine runs in the browser; its phone run is
 * real but its archive POST is answered locally. Analytics and funnel beacons are
 * answered locally too, so the suite leaves no test data in production metrics.
 * Each browser context is fresh, so it starts with the anonymous free run, and
 * no account is ever created.
 *
 * Run:  NODE_PATH=<repo>/node_modules node tests/e2e-sims-live.cjs [--only=nba,nhl]
 *         [--base=https://trustmyrecord.com] [--real-runs=4] [--skip=links,season]
 *         [--out=<dir for evidence json>]
 * One Chromium, one context at a time (the laptop has little memory).
 * Exit code 1 when any check fails. WARN lines never fail the run.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const BASE = String(ARGS.base || 'https://trustmyrecord.com').replace(/\/$/, '');
const ONLY = ARGS.only ? String(ARGS.only).split(',') : ['mlb', 'nfl', 'nba', 'nhl'];
const SKIP = ARGS.skip ? String(ARGS.skip).split(',') : [];
let realRunsLeft = ARGS['real-runs'] !== undefined ? Number(ARGS['real-runs']) : 4;
const OUT = ARGS.out || null;

const DEVICES = {
  desktop: { viewport: { width: 1366, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

/* ------------------------------------------------------------------ results */
const results = [];   // { area, check, ok, detail, warn }
function rec(area, check, ok, detail, warn) {
  results.push({ area, check, ok: !!ok, detail: detail || '', warn: !!warn });
  const tag = ok ? 'ok  ' : (warn ? 'WARN' : 'FAIL');
  console.log(`  ${tag} ${area} :: ${check}${detail ? ' :: ' + String(detail).slice(0, 300) : ''}`);
}
const warn = (area, check, detail) => rec(area, check, false, detail, true);
const evidence = {};
let localServed = 0;

/* ----------------------------------------------------------------- helpers */
const THIRD_PARTY = /google|doubleclick|gstatic|googletag|facebook|fbcdn|clarity|hotjar|cloudflareinsights|adsystem|adservice|amazon-adsystem|taboola|outbrain|cdn\.jsdelivr|cdnjs|unpkg|fonts\.|stripe|sentry|espncdn|nhle\.com|mlbstatic|a\.espncdn/i;
const OURS = /trustmyrecord/i;
const BEACONS = /\/api\/activation\/pulse|google-analytics\.com|googletagmanager\.com\/gtag|\/g\/collect|clarity\.ms\/collect|\/api\/analytics|\/api\/track/i;
const IMPOSSIBLE = /\bNaN\b|\bundefined\b|\[object Object\]|\bInfinity\b/;

async function newContext(browser, device, extra) {
  const ctx = await browser.newContext(Object.assign({}, DEVICES[device], extra || {}));
  await ctx.route(BEACONS, (r) => r.fulfill({ status: 204, body: '' }));
  // --local-root=<checkout>: serve the site's own pages and assets from a local checkout under the
  // real origin, so unpushed fixes are tested against the live API with no CORS difference.
  if (ARGS['local-root']) {
    const root = String(ARGS['local-root']);
    const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
    await ctx.route(/^https:\/\/(www\.)?trustmyrecord\.com\//, (r) => {
      let p = decodeURIComponent(new URL(r.request().url()).pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(root, p);
      if (!f.startsWith(path.resolve(root)) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return r.continue();
      localServed++;
      return r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    });
  }
  // Capture what "Copy share link" buttons put on the clipboard.
  await ctx.addInitScript(() => {
    window.__copied = [];
    try {
      const w = (t) => { window.__copied.push(String(t)); return Promise.resolve(); };
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: w, write: () => Promise.resolve(), readText: () => Promise.resolve('') }, configurable: true });
    } catch (e) { /* ignore */ }
  });
  return ctx;
}

function watch(page) {
  const w = { errors: [], failed: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') w.errors.push(m.text().slice(0, 240)); });
  page.on('pageerror', (e) => w.errors.push('pageerror: ' + String(e.message).slice(0, 240)));
  page.on('requestfailed', (r) => {
    const f = r.failure() && r.failure().errorText;
    if (/ERR_ABORTED/.test(f || '')) return; // navigation away / cancelled image
    w.failed.push(r.url().slice(0, 180) + ' :: ' + f);
  });
  page.on('request', (r) => w.requests.push(r.method() + ' ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) w.failed.push(r.status() + ' ' + r.url().slice(0, 180)); });
  return w;
}

function judgeWatch(area, w) {
  // A signed out visitor's /auth/me answers 401 by design; the browser logs that as a console error.
  const anon401 = w.failed.some((f) => /^401 .*\/api\/auth\/me/.test(f));
  const errs = w.errors.filter((e) => !THIRD_PARTY.test(e) && !/Failed to load resource.*(google|doubleclick|ads)/i.test(e) && !(anon401 && /status of 401/.test(e)));
  rec(area, 'no console errors', errs.length === 0, errs.slice(0, 3).join(' ; '));
  const failed = w.failed.filter((f) => OURS.test(f) && !THIRD_PARTY.test(f) && !/^401 .*\/api\/auth\/me/.test(f));
  rec(area, 'no failed first party requests', failed.length === 0, failed.slice(0, 3).join(' ; '));
}

async function noHorizontalScroll(page, area) {
  const o = await page.evaluate(() => {
    const de = document.documentElement;
    const over = de.scrollWidth - window.innerWidth;
    let culprit = '';
    if (over > 1) {
      const all = [...document.querySelectorAll('body *')];
      const wide = all.filter((n) => { const r = n.getBoundingClientRect(); return r.right > window.innerWidth + 1 && getComputedStyle(n).position !== 'fixed'; });
      const top = wide.filter((n) => !wide.includes(n.parentElement)).slice(0, 3);
      culprit = top.map((n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : '') + '(' + Math.round(n.getBoundingClientRect().right) + ')').join(', ');
    }
    return { over, culprit };
  });
  rec(area, 'no horizontal scroll', o.over <= 1, o.over > 1 ? `page is ${o.over}px wider than the screen: ${o.culprit}` : '');
}

async function visibleText(page, sel) {
  return page.evaluate((s) => { const n = document.querySelector(s); return n ? n.innerText : ''; }, sel || 'body');
}

/* Visible tables under a root as { head, rows } with cell text. */
async function tables(page, root) {
  return page.$$eval(root + ' table', (ts) => ts.filter((t) => t.offsetParent !== null).map((t) => {
    const rows = [...t.rows].map((r) => [...r.cells].map((c) => c.innerText.replace(/\s+/g, ' ').trim()));
    return { cls: t.className, head: rows[0] || [], rows: rows.slice(1) };
  }));
}
const num = (s) => { const m = String(s == null ? '' : s).replace(/[−–]/g, '-').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : NaN; };
const col = (t, name) => t.head.findIndex((h) => h.toUpperCase() === name.toUpperCase());
const made = (s) => { const m = String(s).match(/(\d+)\s*[-/]\s*(\d+)/); return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN]; };
const teamRow = (t) => t.rows.find((r) => /^TEAM$|^TOTALS?$/i.test(r[0]));
const playerRows = (t) => t.rows.filter((r) => r[0] && !/^TEAM$|^TOTALS?$/i.test(r[0]));
const sumCol = (rows, i, f) => rows.reduce((a, r) => a + (f ? f(r[i]) : (num(r[i]) || 0)), 0);

async function clickTab(page, root, label) {
  return page.evaluate(([root, label]) => {
    const b = [...document.querySelectorAll(root + ' .tabs button, ' + root + ' [role=tab]')]
      .find((x) => x.textContent.trim().toLowerCase() === label.toLowerCase());
    if (!b) return false;
    b.click();
    return true;
  }, [root, label]);
}

/* ------------------------------------------------------------ A. page smoke */
const PAGES = {
  mlb: ['/mlb-simulator/', '/mlb-season-simulator/', '/mlb-playoff-simulator/', '/mlb-simulator/saved/', '/mlb-simulator/results/', '/mlb-simulator/teams/arizona-diamondbacks/'],
  nfl: ['/nfl-simulator/', '/nfl-season-simulator/', '/nfl-playoff-simulator/', '/nfl-simulator/results/', '/nfl-simulator/49ers-vs-rams/', '/nfl-simulator/teams/arizona-cardinals/'],
  nba: ['/nba-simulator/', '/nba-season-simulator/', '/nba-playoff-simulator/', '/nba-simulator/results/', '/nba-simulator/celtics-vs-knicks/', '/nba-simulator/teams/boston-celtics/'],
  nhl: ['/nhl-simulator/', '/nhl-season-simulator/', '/nhl-playoff-simulator/', '/nhl-simulator/results/', '/nhl-simulator/avalanche-vs-golden-knights/', '/nhl-simulator/teams/boston-bruins/'],
  hub: ['/sports-simulators/', '/trustmyrecord-tools/'],
};
const linkPool = new Set();

async function smoke(browser, sport, url, device) {
  const area = `${sport} ${device} ${url}`;
  const ctx = await newContext(browser, device);
  const page = await ctx.newPage();
  const w = watch(page);
  try {
    const resp = await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    rec(area, 'HTTP 200', resp && resp.status() === 200, resp ? 'status ' + resp.status() : 'no response');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    judgeWatch(area, w);
    await noHorizontalScroll(page, area);
    const text = await visibleText(page, 'main') || await visibleText(page, 'body');
    const bad = text.match(new RegExp('.{0,60}(' + IMPOSSIBLE.source + ').{0,40}'));
    rec(area, 'no impossible values on screen', !bad, bad ? bad[0] : '');
    if (sport === 'mlb' && /^\/mlb-(simulator|season-simulator|playoff-simulator)\/$/.test(url)) {
      const off = /2026 season complete/i.test(text) && /March 25, 2027/.test(text);
      rec(area, 'offseason banner (2026 complete, opens March 25, 2027)', off, off ? '' : (text.match(/[^\n]*(season|Opening Day)[^\n]*/i) || [''])[0].slice(0, 160));
    }
    if (/\/(nba|nhl|nfl|mlb)-simulator\/$/.test(url)) {
      // Logged out visitor: the free run / free account offer must be stated.
      const fullText = await visibleText(page, 'body');
      rec(area, 'logged out offer is shown', /free/i.test(fullText), '');
    }
    if (device === 'desktop') {
      const links = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
      links.filter((h) => /^https:\/\/(www\.)?trustmyrecord\.com\//.test(h)).forEach((h) => linkPool.add(h.split('#')[0]));
    }
    if (/season-simulator|playoff-simulator/.test(url)) await seasonTables(page, area, sport, url);
  } catch (e) {
    rec(area, 'page completes', false, e.message.split('\n')[0]);
  } finally {
    await ctx.close();
  }
}

/* --------------------------------------------- F. season / playoff tables */
async function seasonTables(page, area, sport, url) {
  const ts = await tables(page, 'main').catch(() => []);
  if (sport === 'mlb') return; // offseason: entries closed, no projection table to check
  rec(area, 'projection tables render', ts.length >= 1, ts.length + ' tables');
  let badPct = [];
  const sums = {};
  const counts = {};
  for (const t of ts) {
    const sig = t.head.join('|');
    t.head.forEach((h, i) => {
      for (const r of t.rows) {
        const c = r[i];
        if (/%/.test(c || '')) {
          const v = num(c);
          if (!(v >= 0 && v <= 100)) badPct.push(h + '=' + c);
          if (/<\s*1|>\s*99/.test(c)) continue;
        }
      }
      if (/^(Title|Cup|Win the title|Win the Cup|Playoffs|1 seed|Division|Win division|Top 6|Play in)$/i.test(h)) {
        const key = h.toLowerCase();
        for (const r of t.rows) {
          const c = r[i] || '';
          let v = num(c);
          if (/^</.test(c.trim())) v = 0.3; else if (/^>/.test(c.trim())) v = 99.75; else if (/^[-—–]$/.test(c.trim()) || c.trim() === '') v = 0;
          if (/✓|clinched|in\b/i.test(c) && isNaN(v)) v = 100;
          if (/out|elim|✗/i.test(c) && isNaN(v)) v = 0;
          if (!isNaN(v)) { const kk = key + '@' + sig; sums[kk] = (sums[kk] || 0) + v; counts[kk] = (counts[kk] || 0) + 1; }
        }
      }
    });
    // Monotone rounds in the playoff odds table.
    const rounds = ['Playoffs', 'Second round', 'Conference final', 'NBA Finals', 'Cup Final', 'Win the title', 'Win the Cup'].map((n) => col(t, n)).filter((i) => i >= 0);
    if (rounds.length >= 3) {
      const viol = t.rows.filter((r) => { const v = rounds.map((i) => num(r[i]) || 0); return v.some((x, k) => k > 0 && x > v[k - 1] + 0.6); });
      rec(area, 'playoff rounds only shrink (Playoffs >= R2 >= CF >= Final >= title)', viol.length === 0, viol.slice(0, 2).map((r) => r.join('|')).join(' ; '));
    }
    // 80% range must contain the projection.
    const wi = col(t, 'Points') >= 0 ? col(t, 'Points') : col(t, 'Wins');
    const ri = col(t, '80% range');
    if (wi >= 0 && ri >= 0) {
      const viol = t.rows.filter((r) => { const [lo, hi] = String(r[ri]).replace(/[−–]/g, '-').split(/\s*(?:-|to)\s*/).map(num); const v = num(r[wi]); return !(lo <= v + 0.5 && v - 0.5 <= hi); });
      rec(area, '80% range contains the projection', viol.length === 0, viol.slice(0, 2).map((r) => r.join('|')).join(' ; '));
    }
  }
  rec(area, 'every percentage within 0..100', badPct.length === 0, badPct.slice(0, 4).join(' ; '));
  const expect = {
    nba: { title: 100, 'win the title': 100, playoffs: url.includes('playoff') ? null : 16 * 100, 'top 6': 1200, 'play in': 800 },
    nhl: { cup: 100, 'win the cup': 100, playoffs: 1600, division: 400 },
    nfl: { playoffs: 1400, '1 seed': 200, division: 800, 'win division': 800 },
  }[sport] || {};
  for (const [kk, total] of Object.entries(sums)) {
    const k = kk.split('@')[0];
    const want = expect[k];
    if (!want) continue;
    if (counts[kk] < 30) continue; // this table shows only part of the league
    // Each shown value is rounded to a whole percent, so the sum may drift by up to half a point a row.
    const tol = Math.max(2, want * 0.02, 0.25 * counts[kk]);
    rec(area, `column "${k}" sums to ${want / 100} team(s)`, Math.abs(total - want) <= tol, `sum ${total.toFixed(1)} over ${counts[kk]} rows`);
  }
  evidence[area] = { tables: ts.map((t) => ({ head: t.head, rows: t.rows.length })), sums };
}

/* -------------------------------------------------------------- B. links */
async function checkLinks(browser) {
  const ctx = await newContext(browser, 'desktop');
  const links = [...linkPool].filter((h) => !/\/(api|admin|logout|login|signup|register|cdn-cgi)\b/.test(h) && !/\.(png|jpe?g|webp|svg|pdf)$/i.test(h));
  const bad = [];
  let i = 0;
  for (const h of links) {
    i++;
    try {
      let r = await ctx.request.get(h, { timeout: 30000, maxRedirects: 5 });
      if (r.status() === 429 || r.status() >= 500) { await new Promise((z) => setTimeout(z, 1500)); r = await ctx.request.get(h, { timeout: 30000 }); }
      if (r.status() !== 200) bad.push(r.status() + ' ' + h);
    } catch (e) { bad.push('ERR ' + h + ' ' + e.message.split('\n')[0]); }
  }
  rec('links', `${links.length} same site links on simulator pages return 200`, bad.length === 0, bad.slice(0, 8).join(' ; '));
  evidence.links = { checked: links.length, bad };
  await ctx.close();
}

/* ----------------------------------------------------- C+D. sport drivers */
const SIM_API = /\/api\/(nba|nhl|nfl)\/public\/simulate/;
const MLB_ARCHIVE = /\/api\/mlb-sim-history\/runs/;
const captured = {};   // sport -> { url, body }
// --replay=<dir>: answer every NBA/NHL/NFL simulate call from a captured-sims.json written by an
// earlier --out run, so a local or staging check spends no real runs at all.
if (ARGS.replay) { Object.assign(captured, JSON.parse(fs.readFileSync(path.join(String(ARGS.replay), 'captured-sims.json'), 'utf8'))); realRunsLeft = 0; }

async function pickTeams(page, awaySel, homeSel, ai, hi) {
  return page.evaluate(([a, h, ai, hi]) => {
    const A = document.querySelector(a); const H = document.querySelector(h);
    const o = (s) => [...s.options].filter((x) => x.value);
    if (!A || !H || o(A).length < 2) return null;
    A.value = o(A)[ai].value; H.value = o(H)[hi].value;
    A.dispatchEvent(new Event('change', { bubbles: true })); H.dispatchEvent(new Event('change', { bubbles: true }));
    return [A.value, H.value];
  }, [awaySel, homeSel, ai, hi]);
}

async function runSport(browser, sport, device) {
  const area = `${sport} ${device} run`;
  const real = device === 'desktop' && realRunsLeft > 0;
  const ctx = await newContext(browser, device);
  if (sport !== 'mlb' && !real) {
    if (!captured[sport]) { warn(area, 'replay', 'no captured desktop response to replay; skipped'); await ctx.close(); return; }
    await ctx.route(SIM_API, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: captured[sport].body }));
  }
  if (sport === 'mlb' && !real) await ctx.route(MLB_ARCHIVE, (r) => r.fulfill({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' }));
  if (real) realRunsLeft--;
  const page = await ctx.newPage();
  const w = watch(page);
  if (sport !== 'mlb' && real) {
    page.on('response', async (r) => { if (SIM_API.test(r.url()) && r.status() === 200) { try { captured[sport] = { url: r.url(), body: await r.text() }; } catch (e) { /* ignore */ } } });
  }
  try {
    await page.goto(BASE + `/${sport}-simulator/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    console.log(`  ..  ${area}: ${real ? 'REAL run on the live API' : (sport === 'mlb' ? 'browser engine run, archive POST answered locally' : 'replaying the desktop response')}`);
    if (sport === 'mlb') await mlbRun(page, area);
    else if (sport === 'nfl') await nflRun(page, area);
    else await hoopsHockeyRun(page, area, sport);
    await noHorizontalScroll(page, area + ' (after result)');
    judgeWatch(area, w);
    // E. the result URL / share link must select but never auto run.
    let share = page.url();
    const copied = await page.evaluate(() => window.__copied || []);
    const link = copied.find((c) => /^https?:\/\//.test(c) && /simulator/.test(c));
    if (link) share = link;
    if (sport === 'mlb' && !link) {
      const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Copy Share Link/i.test(x.textContent)); if (b) b.click(); return !!b; });
      await page.waitForTimeout(600);
      const c2 = await page.evaluate(() => window.__copied || []);
      const l2 = c2.find((c) => /^https?:\/\//.test(c));
      if (l2) share = l2; else rec(area, 'share link produced', false, clicked ? 'button clicked, nothing copied' : 'no Copy Share Link button');
    }
    await ctx.close();
    if (share && share !== BASE + `/${sport}-simulator/`) await deepLink(browser, sport, device, share);
    else warn(area, 'deep link', 'result left no shareable URL to test');
  } catch (e) {
    rec(area, 'simulation completes', false, e.message.split('\n')[0]);
    try { await page.screenshot({ path: path.join(OUT || '.', `fail_${sport}_${device}.png`) }); } catch (_) { /* ignore */ }
    await ctx.close().catch(() => {});
  }
}

async function deepLink(browser, sport, device, url) {
  const area = `${sport} ${device} shared link`;
  const ctx = await newContext(browser, device);
  let simCalls = 0;
  const simUrls = [];
  await ctx.route(SIM_API, (r) => { simCalls++; simUrls.push(r.request().url()); r.abort(); });
  await ctx.route(MLB_ARCHIVE, (r) => { simCalls++; r.abort(); });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    rec(area, 'opens with 200', resp && resp.status() === 200, url.replace(BASE, ''));
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    rec(area, 'does not run a simulation on load', simCalls === 0, simCalls ? simCalls + ' simulate calls fired on load' : '');
    if (sport === 'nba' || sport === 'nhl') {
      const q = new URL(url).searchParams;
      const sel = await page.evaluate(() => [document.querySelector('#awayTeam') && document.querySelector('#awayTeam').selectedOptions[0] && document.querySelector('#awayTeam').selectedOptions[0].textContent, document.querySelector('#homeTeam') && document.querySelector('#homeTeam').selectedOptions[0] && document.querySelector('#homeTeam').selectedOptions[0].textContent]);
      rec(area, 'the linked matchup is selected', sel[0] && sel[1] && !/select|choose|pick/i.test(sel[0] + sel[1]), `${q.get('away')}@${q.get('home')} -> ${sel.join(' @ ')}`);
    }
    // The first press replays the linked seed (the request is intercepted, so no real run is spent).
    const seed = new URL(url).searchParams.get('seed');
    const btn = sport === 'nfl' ? '#featBtn' : (sport === 'mlb' ? null : '#runBtn');
    if (seed && btn && simCalls === 0) {
      await page.click(btn).catch(() => {});
      await page.waitForTimeout(2500);
      rec(area, 'first press replays the shared seed', simUrls.some((u) => u.includes('seed=' + seed)), simUrls.map((u) => u.replace(/^.*\/api\//, '')).join(' ; ').slice(0, 200) || 'no simulate request');
    }
  } catch (e) {
    rec(area, 'shared link loads', false, e.message.split('\n')[0]);
  } finally { await ctx.close(); }
}

/* ---------------------------------------------------------------- NBA/NHL */
async function hoopsHockeyRun(page, area, sport) {
  await page.waitForFunction(() => document.querySelector('#homeTeam') && document.querySelector('#homeTeam').options.length > 20, null, { timeout: 90000 });
  const n = await page.$eval('#homeTeam', (s) => [...s.options].filter((o) => o.value).length);
  rec(area, 'team picker lists the league', n >= 30 && n <= 33, n + ' teams');
  // Controls: venue toggle, sim count buttons respond.
  const venue = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Neutral site/i.test(x.textContent));
    if (!b) return 'missing';
    b.click(); const on = b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true';
    const back = [...document.querySelectorAll('button')].find((x) => /Home (court|ice)/i.test(x.textContent)); if (back) back.click();
    return on ? 'ok' : 'no state change';
  });
  rec(area, 'venue toggle responds', venue === 'ok', venue);
  const picked = await pickTeams(page, '#awayTeam', '#homeTeam', 0, 1);
  rec(area, 'two teams selected', picked && picked[0] !== picked[1], String(picked));
  if (sport === 'nhl') {
    await page.waitForFunction(() => document.querySelector('#homeGoalie') && document.querySelector('#homeGoalie').options.length > 1 && document.querySelector('#awayGoalie').options.length > 1, null, { timeout: 30000 }).catch(() => {});
    const g = await page.evaluate(() => [document.querySelector('#awayGoalie').options.length, document.querySelector('#homeGoalie').options.length]);
    rec(area, 'goalie pickers fill after a team is chosen', g[0] > 1 && g[1] > 1, g.join('/'));
  }
  await page.waitForTimeout(800);
  await page.click('#runBtn');
  await page.waitForFunction(() => { const r = document.querySelector('#result'); return r && r.innerText.length > 600 && /Final/.test(r.innerText); }, null, { timeout: 180000 });
  await page.waitForTimeout(800);
  const text = await visibleText(page, '#result');
  const bad = text.match(new RegExp('.{0,50}(' + IMPOSSIBLE.source + ').{0,30}'));
  rec(area, 'result has no impossible values', !bad, bad ? bad[0] : '');
  const recap = await page.$eval('#result .recap', (x) => x.textContent.trim()).catch(() => '');
  rec(area, 'recap present', recap.length > 20, recap.slice(0, 80));
  const tabsAll = await page.$$eval('#result .tabs button', (b) => b.map((x) => x.textContent.trim()));
  const ev = { tabs: tabsAll, recap, tables: {} };
  for (const t of tabsAll) {
    await clickTab(page, '#result', t);
    await page.waitForTimeout(250);
    ev.tables[t] = await tables(page, '#result');
    ev[t + ' text'] = (await visibleText(page, '#result')).slice(0, 6000);
  }
  evidence[area] = ev;
  if (sport === 'nba') reconcileNba(area, ev, recap);
  else reconcileNhl(area, ev, recap);
  // Highlights / events.
  const evTab = tabsAll.find((t) => /Important events/i.test(t));
  rec(area, 'important events / highlights tab has content', evTab && (ev[evTab + ' text'] || '').length > 300, evTab ? (ev[evTab + ' text'] || '').length + ' chars' : 'no tab');
  // Copy share link the way a visitor would.
  await page.evaluate(() => { const b = [...document.querySelectorAll('#result button')].find((x) => /Share result/i.test(x.textContent)); if (b) b.click(); });
  await page.waitForTimeout(500);
  // Pin for comparison works without an account.
  const pin = await page.evaluate(() => { const b = [...document.querySelectorAll('#result button')].find((x) => /Pin for comparison/i.test(x.textContent)); if (!b) return 'missing'; b.click(); return 'clicked'; });
  await page.waitForTimeout(500);
  rec(area, 'pin for comparison clickable', pin === 'clicked', pin);
}

function reconcileNba(area, ev, recap) {
  const box = (ev.tables['Full box score'] || []).filter((t) => col(t, 'PTS') >= 0 && col(t, 'MIN') >= 0);
  rec(area, 'box score: two team tables', box.length === 2, box.length + ' tables');
  const q = (ev.tables['Scoring by quarter'] || ev.tables['Game summary'] || []).find((t) => /FINAL/i.test(t.head[t.head.length - 1] || '') && t.rows.length === 2);
  const finals = q ? q.rows.map((r) => num(r[r.length - 1])) : [];
  if (q) {
    q.rows.forEach((r) => {
      const parts = r.slice(1, -1).map(num);
      rec(area, `quarters add to the final (${r[0]})`, parts.reduce((a, b) => a + b, 0) === num(r[r.length - 1]), parts.join('+') + ' vs ' + r[r.length - 1]);
    });
  } else rec(area, 'quarter scoring table present', false, '');
  if (finals.length === 2) rec(area, 'recap agrees with the final', recap.includes(Math.max(...finals) + '-' + Math.min(...finals)), recap.slice(0, 60) + ' vs ' + finals.join('-'));
  box.forEach((t, k) => {
    const tr = teamRow(t); const ps = playerRows(t);
    if (!tr) { rec(area, 'box team row', false, 'no TEAM row'); return; }
    const mism = [];
    for (const c of ['PTS', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF']) { const i = col(t, c); if (i >= 0 && sumCol(ps, i) !== num(tr[i])) mism.push(`${c} players ${sumCol(ps, i)} vs team ${tr[i]}`); }
    for (const c of ['FG', '3PT', 'FT']) { const i = col(t, c); if (i < 0) continue; const m = ps.reduce((a, r) => [a[0] + made(r[i])[0], a[1] + made(r[i])[1]], [0, 0]); const tm = made(tr[i]); if (m[0] !== tm[0] || m[1] !== tm[1]) mism.push(`${c} ${m.join('-')} vs ${tr[i]}`); }
    const iMin = col(t, 'MIN'); const mins = sumCol(ps, iMin);
    if (Math.abs(mins - num(tr[iMin])) > 0.6) mism.push(`MIN players ${mins.toFixed(1)} vs team ${tr[iMin]}`);
    if (Math.abs(num(tr[iMin]) - 240) % 25 > 0.6 && Math.abs(num(tr[iMin]) - 240) % 25 < 24.4) mism.push('team minutes ' + tr[iMin] + ' is not 240 + 25 per OT');
    rec(area, `box score team ${k + 1}: players add up to the TEAM row`, mism.length === 0, mism.join(' ; '));
    const iP = col(t, 'PTS'), iFG = col(t, 'FG'), i3 = col(t, '3PT'), iFT = col(t, 'FT'), iO = col(t, 'OREB'), iD = col(t, 'DREB'), iR = col(t, 'REB');
    const ptsBad = ps.filter((r) => 2 * made(r[iFG])[0] + made(r[i3])[0] + made(r[iFT])[0] !== num(r[iP]) || num(r[iO]) + num(r[iD]) !== num(r[iR]) || made(r[iFG])[0] > made(r[iFG])[1] || made(r[i3])[0] > made(r[iFG])[0]);
    rec(area, `box score team ${k + 1}: every line is internally consistent (PTS = 2FG+3P+FT, OREB+DREB=REB)`, ptsBad.length === 0, ptsBad.slice(0, 2).map((r) => r.slice(0, 9).join('|')).join(' ; '));
    if (finals[k] !== undefined) rec(area, `box score team ${k + 1}: TEAM points equal the linescore`, num(tr[iP]) === finals[k], tr[iP] + ' vs ' + finals[k]);
    // Plausibility (warn only): a heavy minutes player with no rebound, assist, steal or block.
    const empty = ps.filter((r) => num(r[iMin]) >= 30 && ['REB', 'AST', 'STL', 'BLK'].every((c) => num(r[col(t, c)]) === 0));
    if (empty.length) warn(area, `box score team ${k + 1}: 30+ minute line with no REB/AST/STL/BLK`, empty.map((r) => r[0] + ' ' + r[iMin] + ' min').join(', '));
  });
}

function reconcileNhl(area, ev, recap) {
  const sk = (ev.tables['Full box score'] || []).filter((t) => col(t, 'SOG') >= 0 && col(t, 'G') >= 0);
  const gk = (ev.tables['Goaltenders'] || ev.tables['Full box score'] || []).filter((t) => /GOALTENDER/i.test(t.head[0] || ''));
  rec(area, 'box score: two skater tables and goalie tables', sk.length === 2 && gk.length >= 2, sk.length + ' skater, ' + gk.length + ' goalie');
  const per = (ev.tables['Game summary'] || []).concat(ev.tables['Full box score'] || []).find((t) => col(t, 'FINAL') >= 0 && t.rows.length === 2);
  let finals = [], shots = [], so = false;
  if (per) {
    const iF = col(per, 'FINAL'), iS = col(per, 'SHOTS');
    so = col(per, 'SO') >= 0;
    per.rows.forEach((r) => {
      const parts = r.slice(1, iF).map(num);
      rec(area, `periods add to the final (${r[0]})`, parts.reduce((a, b) => a + b, 0) === num(r[iF]), parts.join('+') + ' vs ' + r[iF]);
    });
    finals = per.rows.map((r) => num(r[iF])); shots = per.rows.map((r) => num(r[iS]));
  } else rec(area, 'period scoring table present', false, '');
  if (finals.length === 2) rec(area, 'recap agrees with the final', recap.includes(Math.max(...finals) + '-' + Math.min(...finals)), recap.slice(0, 60) + ' vs ' + finals.join('-'));
  const allCells = sk.concat(gk).flatMap((t) => t.rows.flat());
  const badCell = allCells.find((c) => IMPOSSIBLE.test(c));
  rec(area, 'box score cells have no undefined / NaN', !badCell, badCell || '');
  const regGoals = [];
  sk.forEach((t, k) => {
    const tr = teamRow(t); const ps = playerRows(t);
    if (!tr) { rec(area, 'skater TEAM row', false, ''); return; }
    const mism = [];
    for (const c of ['G', 'A', 'P', 'SOG', 'ATT', 'PIM', 'HIT', 'BLK', 'GV', 'TK', 'PPG', 'SHG']) { const i = col(t, c); if (i >= 0 && sumCol(ps, i) !== num(tr[i])) mism.push(`${c} players ${sumCol(ps, i)} vs team ${tr[i]}`); }
    const iFO = col(t, 'FO');
    if (iFO >= 0) { const s = ps.reduce((a, r) => (/\d+-\d+/.test(r[iFO]) ? [a[0] + made(r[iFO])[0], a[1] + made(r[iFO])[1]] : a), [0, 0]); const tm = made(tr[iFO]); if (s[0] !== tm[0] || s[1] !== tm[1]) mism.push(`FO players ${s.join('-')} vs team ${tr[iFO]}`); }
    rec(area, `skaters team ${k + 1}: players add up to the TEAM row`, mism.length === 0, mism.join(' ; '));
    const pBad = ps.filter((r) => num(r[col(t, 'G')]) + num(r[col(t, 'A')]) !== num(r[col(t, 'P')]) || num(r[col(t, 'G')]) > num(r[col(t, 'SOG')]) || num(r[col(t, 'SOG')]) > num(r[col(t, 'ATT')]));
    rec(area, `skaters team ${k + 1}: every line consistent (G+A=P, G<=SOG<=ATT)`, pBad.length === 0, pBad.slice(0, 2).map((r) => r.slice(0, 7).join('|')).join(' ; '));
    regGoals[k] = num(tr[col(t, 'G')]);
    if (finals[k] !== undefined) rec(area, `skaters team ${k + 1}: goals equal the final${so ? ' (less the shootout goal)' : ''}`, regGoals[k] === finals[k] - (so && finals[k] > finals[1 - k] ? 1 : 0), regGoals[k] + ' vs ' + finals[k]);
    if (shots[k] !== undefined) rec(area, `skaters team ${k + 1}: SOG equal the period table shots`, num(tr[col(t, 'SOG')]) === shots[k], tr[col(t, 'SOG')] + ' vs ' + shots[k]);
  });
  // Goalies: the goalies of team k face the other team's shots.
  const goalieTables = gk.slice(0, 2);
  goalieTables.forEach((t, k) => {
    const rows = t.rows.filter((r) => r[0] && !/^TEAM$/i.test(r[0]));
    const sa = sumCol(rows, col(t, 'SA')), sv = sumCol(rows, col(t, 'SV')), ga = sumCol(rows, col(t, 'GA'));
    const en = col(t, 'EN') >= 0 ? sumCol(rows, col(t, 'EN')) : 0;
    const lineBad = rows.filter((r) => num(r[col(t, 'SA')]) - num(r[col(t, 'GA')]) !== num(r[col(t, 'SV')]));
    rec(area, `goalies team ${k + 1}: SV = SA - GA`, lineBad.length === 0, lineBad.map((r) => r.join('|')).join(' ; '));
    const opp = 1 - k;
    if (regGoals[opp] !== undefined) rec(area, `goalies team ${k + 1}: GA + empty net = opponent goals`, ga + en === regGoals[opp], `GA ${ga} + EN ${en} vs ${regGoals[opp]}`);
    if (shots[opp] !== undefined) rec(area, `goalies team ${k + 1}: shots against <= opponent SOG`, sa <= shots[opp] && sa >= shots[opp] - en, `SA ${sa} vs SOG ${shots[opp]}`);
    void sv;
  });
  // Scoring summary: the running score ends on the final.
  const summ = ev['Scoring summary text'] || '';
  const runs = [...summ.matchAll(/(?:strength|power play|short handed|shorthanded|empty net|penalty shot|extra attacker)[^\d\n]{0,12}(\d+)-(\d+)/gi)].map((m) => [Number(m[1]), Number(m[2])]);
  if (finals.length === 2) {
    const last = runs[runs.length - 1];
    const goals = regGoals.length === 2 ? regGoals[0] + regGoals[1] : finals[0] + finals[1];
    rec(area, 'scoring summary lists every goal and ends on the final', runs.length === goals && last && last[0] === regGoals[0] && last[1] === regGoals[1], `${runs.length} goals listed of ${goals}; last ${last ? last.join('-') : 'none'}`);
  }
}

/* --------------------------------------------------------------------- NFL */
async function nflRun(page, area) {
  await page.waitForSelector('#featBtn', { timeout: 60000 });
  // Controls: week picker changes the schedule; venue toggles respond.
  const wk = await page.evaluate(() => { const s = document.querySelector('#week'); return s ? [...s.options].length : 0; });
  rec(area, 'week picker present', wk >= 17, wk + ' weeks');
  const venue = await page.evaluate(() => { const b = document.querySelector('#vNeutral'); if (!b) return 'missing'; b.click(); const on = b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true'; const h = document.querySelector('#vHome'); if (h) h.click(); return on ? 'ok' : 'no state change'; });
  rec(area, 'venue toggle responds', venue === 'ok', venue);
  await page.click('#featBtn');
  await page.waitForFunction(() => { const r = document.querySelector('#result'); return r && r.innerText.length > 1500; }, null, { timeout: 180000 });
  await page.waitForTimeout(1000);
  const text = await visibleText(page, '#result');
  const bad = text.match(new RegExp('.{0,50}(' + IMPOSSIBLE.source + ').{0,30}'));
  rec(area, 'result has no impossible values', !bad, bad ? bad[0] : '');
  const tabsAll = await page.$$eval('#result .tabs button', (b) => b.map((x) => x.textContent.trim()));
  const ev = { tabs: tabsAll, tables: {} };
  for (const t of tabsAll) {
    await clickTab(page, '#result', t);
    await page.waitForTimeout(300);
    ev.tables[t] = await tables(page, '#result');
    ev[t + ' text'] = (await visibleText(page, '#result')).slice(0, 6000);
  }
  evidence[area] = ev;
  reconcileNfl(area, ev);
  const dated = text.match(/run dated (\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2} \d{1,2})/);
  const shown = text.match(/Run ([A-Z][a-z]{2} \d{1,2}),/);
  if (dated && shown) {
    const label = /^\d{4}/.test(dated[1]) ? new Date(dated[1] + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : dated[1];
    rec(area, 'model footer date agrees with the Pacific run time', label === shown[1], `footer ${dated[1]} vs header ${shown[1]}`);
  }
  await page.evaluate(() => { const b = [...document.querySelectorAll('#result button')].find((x) => /Copy share link/i.test(x.textContent)); if (b) b.click(); });
  await page.waitForTimeout(500);
}

function reconcileNfl(area, ev) {
  const ts = ev.tables['Box Score'] || [];
  const ls = ts.find((t) => t.head[0] === 'TEAM' && t.head[t.head.length - 1] === 'F');
  rec(area, 'box score linescore present', !!ls, '');
  if (!ls) return;
  const finals = ls.rows.map((r) => num(r[r.length - 1]));
  ls.rows.forEach((r) => { const q = r.slice(1, -1).map(num); rec(area, `quarters add to the final (${r[0]})`, q.reduce((a, b) => a + b, 0) === num(r[r.length - 1]), q.join('+') + ' vs ' + r[r.length - 1]); });
  // Group the remaining tables per team: each PASSING table starts a team.
  const groups = [];
  for (const t of ts) { if (/^PASSING$/i.test(t.head[0])) groups.push({}); if (!groups.length) continue; const k = t.head[0].toUpperCase(); if (!groups[groups.length - 1][k]) groups[groups.length - 1][k] = t; }
  rec(area, 'box score has both teams', groups.length === 2, groups.length + ' team groups');
  const kv = (t) => Object.fromEntries((t ? t.rows : []).map((r) => [r[0], r[1]]));
  groups.forEach((g, k) => {
    const mism = [];
    const P = g.PASSING, R = g.RUSHING, C = g.RECEIVING, T = kv(g['TEAM TOTALS']);
    if (P && C) {
      const passYds = sumCol(P.rows, col(P, 'YDS')); const recYds = sumCol(C.rows, col(C, 'YDS'));
      if (passYds !== recYds) mism.push(`pass yds ${passYds} vs receiving ${recYds}`);
      const comp = P.rows.reduce((a, r) => a + made(r[col(P, 'C/ATT')])[0], 0); const att = P.rows.reduce((a, r) => a + made(r[col(P, 'C/ATT')])[1], 0);
      const recs = C.rows.reduce((a, r) => a + made(r[col(C, 'REC/TGT')])[0], 0); const tgt = C.rows.reduce((a, r) => a + made(r[col(C, 'REC/TGT')])[1], 0);
      if (comp !== recs) mism.push(`completions ${comp} vs receptions ${recs}`);
      if (tgt > att) mism.push(`targets ${tgt} > attempts ${att}`);
      const passTd = sumCol(P.rows, col(P, 'TD')); const recTd = sumCol(C.rows, col(C, 'TD'));
      if (passTd !== recTd) mism.push(`pass TD ${passTd} vs receiving TD ${recTd}`);
      if (T['Passing (net)'] !== undefined && num(T['Passing (net)']) > passYds) mism.push(`net passing ${T['Passing (net)']} > gross ${passYds}`);
    }
    if (R && T.Rushing !== undefined) { const ry = sumCol(R.rows, col(R, 'YDS')); if (ry !== num(T.Rushing)) mism.push(`rushing players ${ry} vs team ${T.Rushing}`); }
    if (T['Total yards'] !== undefined && num(T['Total yards']) !== num(T['Passing (net)']) + num(T.Rushing)) mism.push(`total ${T['Total yards']} != net pass ${T['Passing (net)']} + rush ${T.Rushing}`);
    const opp = groups[1 - k]; const D = kv(g['DEFENSE (TEAM)']); const OT = opp ? kv(opp['TEAM TOTALS']) : {};
    if (opp && D.Sacks !== undefined && OT['Sacks allowed'] !== undefined && num(D.Sacks) !== num(OT['Sacks allowed'])) mism.push(`sacks ${D.Sacks} vs opponent sacks allowed ${OT['Sacks allowed']}`);
    if (opp && opp.PASSING && D.Interceptions !== undefined) { const oi = sumCol(opp.PASSING.rows, col(opp.PASSING, 'INT')); if (oi !== num(D.Interceptions)) mism.push(`interceptions ${D.Interceptions} vs opponent QB INT ${oi}`); }
    if (D.Takeaways !== undefined && num(D.Takeaways) !== num(D.Interceptions) + num(D['Fumble recoveries'])) mism.push(`takeaways ${D.Takeaways} != INT + fumble recoveries`);
    if (opp && D.Takeaways !== undefined && OT.Turnovers !== undefined && num(D.Takeaways) !== num(OT.Turnovers)) mism.push(`takeaways ${D.Takeaways} vs opponent turnovers ${OT.Turnovers}`);
    rec(area, `box score team ${k + 1}: stats reconcile`, mism.length === 0, mism.join(' ; '));
  });
  const sc = ts.find((t) => /^QTR$/i.test(t.head[0]) && col(t, 'PTS') >= 0);
  if (sc) {
    const names = ls.rows.map((r) => r[0]);
    const iT = col(sc, 'TEAM'), iP = col(sc, 'PTS'), iS = col(sc, 'SCORE');
    const abbrs = [...new Set(sc.rows.map((r) => r[iT]))];
    const byTeam = {}; sc.rows.forEach((r) => { byTeam[r[iT]] = (byTeam[r[iT]] || 0) + num(r[iP]); });
    const total = sc.rows.reduce((a, r) => a + num(r[iP]), 0);
    rec(area, 'scoring summary adds to the final', total === finals[0] + finals[1], `${total} vs ${finals.join('+')} (${abbrs.map((a) => a + ' ' + byTeam[a]).join(', ')})`);
    const last = sc.rows.length ? sc.rows[sc.rows.length - 1][iS] : '';
    rec(area, 'scoring summary ends on the final score', last === finals.join('-'), `${last} vs ${finals.join('-')} (${names.join(' / ')})`);
  } else if (finals[0] + finals[1] > 0) rec(area, 'scoring summary present', false, '');
}

/* --------------------------------------------------------------------- MLB */
async function mlbRun(page, area) {
  await page.waitForFunction(() => document.querySelector('#awayTeamSelect') && document.querySelector('#awayTeamSelect').options.length >= 30, null, { timeout: 90000 });
  const n = await page.$eval('#awayTeamSelect', (s) => s.options.length);
  rec(area, 'team picker lists 30 clubs', n >= 30, n + ' options');
  // Changing the away club must refill its pitcher list with that club's arms.
  const before = await page.$$eval('#awayPitcherSelect option', (o) => o.map((x) => x.textContent.trim()).join('|'));
  const changed = await page.evaluate(() => { const s = document.querySelector('#awayTeamSelect'); const cur = s.selectedIndex; const next = (cur + 7) % s.options.length; s.selectedIndex = next; s.dispatchEvent(new Event('change', { bubbles: true })); return s.options[next].textContent.trim(); });
  await page.waitForTimeout(2500);
  const after = await page.$$eval('#awayPitcherSelect option', (o) => o.map((x) => x.textContent.trim()).join('|'));
  rec(area, 'pitcher picker refills when the club changes', after && after !== before && !/undefined/.test(after), `${changed}: ${after.slice(0, 90)}`);
  // Mode toggle: Classic Teams switches the pool, Current Teams returns.
  const mode = await page.evaluate(async () => {
    const h = document.querySelector('#historicalModeButton'), c = document.querySelector('#currentModeButton');
    if (!h || !c) return 'missing';
    const a = document.querySelector('#awayTeamSelect').options[0] && document.querySelector('#awayTeamSelect').options[0].textContent;
    h.click(); await new Promise((r) => setTimeout(r, 1500));
    const b = document.querySelector('#awayTeamSelect').options[0] && document.querySelector('#awayTeamSelect').options[0].textContent;
    c.click(); await new Promise((r) => setTimeout(r, 1500));
    return a !== b ? 'ok' : 'pool did not change (' + a + ')';
  });
  rec(area, 'Classic Teams mode switches the team pool', mode === 'ok', mode);
  await page.waitForTimeout(1500);
  await page.click('#runSimulationButton');
  await page.waitForFunction(() => { const r = document.querySelector('#resultCard'); return r && /FINAL/i.test(r.innerText) && r.innerText.length > 300; }, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  const text = await visibleText(page, '#resultCard');
  const bad = text.match(new RegExp('.{0,50}(' + IMPOSSIBLE.source + ').{0,30}'));
  rec(area, 'result has no impossible values', !bad, bad ? bad[0] : '');
  const ev = { card: text.slice(0, 4000), cardTables: await tables(page, '#resultCard') };
  // Box score view.
  const opened = await page.evaluate(() => { const b = [...document.querySelectorAll('#resultCard button, #resultCard a')].find((x) => /View Box Score/i.test(x.textContent)); if (b) { b.click(); return true; } return false; });
  rec(area, 'View Box Score opens', opened, '');
  await page.waitForTimeout(2500);
  ev.allTables = await tables(page, 'body');
  ev.boxText = (await visibleText(page, 'body')).slice(0, 12000);
  evidence[area] = ev;
  reconcileMlb(area, ev);
}

function reconcileMlb(area, ev) {
  const ls = (ev.cardTables || []).concat(ev.allTables || []).find((t) => col(t, 'R') >= 0 && col(t, 'H') >= 0 && col(t, '1') >= 0);
  rec(area, 'linescore present', !!ls, '');
  if (!ls) return;
  const iR = col(ls, 'R'), iH = col(ls, 'H');
  const rows = ls.rows.filter((r) => r.length > iR);
  rows.forEach((r) => { const inn = r.slice(col(ls, '1'), iR).map((x) => (/^x$|^-$|^$/i.test(x) ? 0 : num(x))); rec(area, `innings add to R (${r[0].slice(0, 30)})`, inn.reduce((a, b) => a + b, 0) === num(r[iR]), inn.join('+') + ' vs ' + r[iR]); });
  const final = ev.card.match(/FINAL\s*\n?\s*([A-Z]{2,3}) (\d+), ([A-Z]{2,3}) (\d+)/);
  if (final && rows.length === 2) rec(area, 'FINAL line agrees with the linescore', Number(final[2]) === num(rows[0][iR]) && Number(final[4]) === num(rows[1][iR]), final[0].replace(/\s+/g, ' ') + ' vs ' + rows.map((r) => r[iR]).join('-'));
  // Batting tables: AB/R/H columns per team; their R and H must equal the linescore.
  const bat = (ev.allTables || []).filter((t) => col(t, 'AB') >= 0 && col(t, 'H') >= 0 && col(t, 'R') >= 0 && col(t, '1') < 0);
  if (bat.length >= 2) {
    bat.slice(0, 2).forEach((t, k) => {
      const ps = playerRows(t).filter((r) => !/^(totals?|team)$/i.test(r[0]));
      const tr = teamRow(t);
      const r = sumCol(ps, col(t, 'R')), h = sumCol(ps, col(t, 'H'));
      const want = rows[k] ? [num(rows[k][iR]), num(rows[k][iH])] : [NaN, NaN];
      rec(area, `batting team ${k + 1}: R and H equal the linescore`, r === want[0] && h === want[1], `batters R ${r} H ${h} vs linescore R ${want[0]} H ${want[1]}`);
      if (tr) { const mism = ['AB', 'R', 'H', 'RBI', 'BB', 'SO', 'K', 'HR'].filter((c) => col(t, c) >= 0 && sumCol(ps, col(t, c)) !== num(tr[col(t, c)])); rec(area, `batting team ${k + 1}: players add to totals`, mism.length === 0, mism.join(',')); }
    });
    const pit = (ev.allTables || []).filter((t) => col(t, 'IP') >= 0 && col(t, 'ER') >= 0);
    pit.slice(0, 2).forEach((t, k) => {
      const ps = playerRows(t);
      const hAllowed = sumCol(ps, col(t, 'H')); const rAllowed = sumCol(ps, col(t, 'R')); const er = sumCol(ps, col(t, 'ER'));
      const opp = rows[1 - k];
      if (opp) rec(area, `pitching team ${k + 1}: hits and runs allowed equal the opponent linescore`, hAllowed === num(opp[iH]) && rAllowed === num(opp[iR]) && er <= rAllowed, `H ${hAllowed} R ${rAllowed} ER ${er} vs opp H ${opp[iH]} R ${opp[iR]}`);
    });
  } else warn(area, 'batting box score tables', 'found ' + bat.length + ' batting tables after View Box Score');
  rec(area, 'play by play / recap text present', /inning|single|double|homer|strikes out|grounds|flies|walk/i.test(ev.boxText), '');
}

/* ------------------------------------------------- season sim (client side) */
async function seasonRun(browser, sport) {
  const area = `${sport} desktop season run`;
  const ctx = await newContext(browser, 'desktop');
  const page = await ctx.newPage();
  const w = watch(page);
  try {
    await page.goto(BASE + `/${sport}-season-simulator/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    const stampBefore = await page.$eval('#lsimStamp', (n) => n.textContent).catch(() => '');
    const runs = await page.$('#lsimRuns');
    if (runs) await page.selectOption('#lsimRuns', { index: 0 }).catch(() => {});
    await page.click('#runSim');
    await page.waitForFunction((b) => { const s = document.querySelector('#lsimStamp'); const st = document.querySelector('#lsimStatus'); return (s && s.textContent !== b && s.textContent.length > 5) || (st && /fail|error|could not/i.test(st.textContent)); }, stampBefore, { timeout: 180000 });
    const status = await page.$eval('#lsimStatus', (n) => n.textContent).catch(() => '');
    rec(area, 'season run finishes in the browser', !/fail|error|could not/i.test(status), status.slice(0, 120));
    judgeWatch(area, w);
    await seasonTables(page, area, sport, `/${sport}-season-simulator/`);
  } catch (e) {
    rec(area, 'season run completes', false, e.message.split('\n')[0]);
  } finally { await ctx.close(); }
}

/* -------------------------------------------------------------------- main */
(async function main() {
  const t0 = Date.now();
  console.log(`e2e-sims-live against ${BASE}  sports=${ONLY.join(',')}  real runs budget=${realRunsLeft}`);
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  try {
    if (!SKIP.includes('smoke')) {
      for (const sport of ONLY.concat(SKIP.includes('hub') ? [] : ['hub'])) for (const url of PAGES[sport] || []) for (const d of ['desktop', 'phone']) await smoke(browser, sport, url, d);
    }
    if (!SKIP.includes('runs')) for (const sport of ONLY) for (const d of ['desktop', 'phone']) await runSport(browser, sport, d);
    if (!SKIP.includes('season')) for (const sport of ONLY.filter((s) => s !== 'mlb')) await seasonRun(browser, sport);
    if (!SKIP.includes('links')) await checkLinks(browser);
  } finally { await browser.close(); }

  const fails = results.filter((r) => !r.ok && !r.warn);
  const warns = results.filter((r) => r.warn);
  const by = {};
  results.forEach((r) => { const k = r.area.split(' ').slice(0, 2).join(' '); by[k] = by[k] || { pass: 0, fail: 0, warn: 0 }; by[k][r.ok ? 'pass' : (r.warn ? 'warn' : 'fail')]++; });
  console.log('\nSUMMARY (area: pass/fail/warn)');
  Object.entries(by).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} ${v.pass}/${v.fail}/${v.warn}`));
  if (ARGS['local-root']) console.log(`  (${localServed} responses served from ${ARGS['local-root']})`);
  console.log(`\n${results.length} checks,${fails.length} failed, ${warns.length} warnings, ${Math.round((Date.now() - t0) / 1000)}s`);
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, results, by }, null, 1));
    fs.writeFileSync(path.join(OUT, 'e2e-evidence.json'), JSON.stringify(evidence, null, 1));
    if (!ARGS.replay && Object.keys(captured).length) fs.writeFileSync(path.join(OUT, 'captured-sims.json'), JSON.stringify(captured));
  }
  if (fails.length) { console.log('\nFAILURES'); fails.forEach((f) => console.log(`  ${f.area} :: ${f.check} :: ${f.detail}`)); process.exit(1); }
}());
