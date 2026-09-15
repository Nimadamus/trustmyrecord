#!/usr/bin/env node
/**
 * THE TICKER KEEPS ITS LAST KNOWN GOOD SLATE (Nima, 2026-09-15).
 *
 * A backend deploy at 11:38 PM PDT answered twice with an HTML page and once
 * with an MLB row of zero games, and an open homepage showed "Today's games are
 * temporarily unavailable" or dropped baseball. This proves the strip now rides
 * through exactly that:
 *
 *   1. the pure pieces (slateUsable, holdRows) agree between the page script and
 *      the edge worker, over every shape of bad answer;
 *   2. in a browser, with a paused clock and a scripted API: an HTML page, a
 *      network timeout and a degraded empty MLB row each leave the cards on
 *      screen; a missing sport keeps its cards while the others update; a clean
 *      answer resets everything; a long failure turns the strip "Delayed" before
 *      it ever says unavailable; a first visit with nothing to fall back on
 *      keeps its loading state until three refreshes have failed; and a return
 *      visit during an outage is drawn from the stored copy.
 *
 *   node tests/ticker-last-known-good-test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TMR_LKG_PORT || 4211);
const FIXTURE = path.join(__dirname, 'fixtures', 'nav-mlb-slate-postgame.json');
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); return ok; };

/* ---------- 1. the pure pieces, both files ---------- */
const csrc = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-home-live.js'), 'utf8');
const wsrc = fs.readFileSync(path.join(ROOT, 'workers', 'home-ssr', 'worker.mjs'), 'utf8');
function grab(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function not found: ${name}`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (!depth) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced: ${name}`);
}
const constOf = (src, name) => {
  const m = new RegExp(`(?:var|const) ${name} = ([^;]+);`).exec(src);
  if (!m) throw new Error(`constant not found: ${name}`);
  return `var ${name} = ${m[1]};`;
};
const lift = (src) => new Function(
  ['TK_ROW_KEYS', 'TK_ROW_HOLD_MS'].map((n) => constOf(src, n)).join('')
  + grab(src, 'slateUsable') + grab(src, 'holdRows')
  + ';return { slateUsable: slateUsable, holdRows: holdRows };')();
const client = lift(csrc);
const edge = lift(wsrc);

const T = 1_800_000_000_000;
const good = { ok: true, slate_date: '2026-09-15', games: [{ game_pk: 1 }, { game_pk: 2 }], nfl_games: [{ id: 'n1' }], cfb_games: [], nba_games: [], nhl_games: [] };
const lkg = { payload: good, rowAt: { games: T, nfl_games: T, cfb_games: T, nba_games: T, nhl_games: T }, goodAt: T };
const cases = [
  ['null', null], ['html string', '<!DOCTYPE html><html>'], ['array', []], ['ok false', { ok: false, slate_date: '2026-09-15', games: [] }],
  ['no games array', { ok: true, slate_date: '2026-09-15' }], ['other day', Object.assign({}, good, { slate_date: '2026-09-14' })]
];
cases.forEach(([label, p]) => {
  check(client.slateUsable(p, '2026-09-15') === false, `client accepts a bad slate: ${label}`);
  check(edge.slateUsable(p, '2026-09-15') === false, `edge accepts a bad slate: ${label}`);
});
check(client.slateUsable(good, '2026-09-15') && edge.slateUsable(good, '2026-09-15'), 'a good slate is refused');

const scenarios = [
  ['degraded empty MLB inside the hold', Object.assign({}, good, { games: [], degraded: true, mlb_available: false }), T + 60000, ['games']],
  ['NFL row missing', (() => { const p = Object.assign({}, good); delete p.nfl_games; return p; })(), T + 60000, ['nfl_games']],
  ['every row empty', Object.assign({}, good, { games: [], nfl_games: [] }), T + 90000, ['games', 'nfl_games']],
  ['empty MLB past the hold is believed', Object.assign({}, good, { games: [] }), T + 6 * 60000, []],
  ['a new day is never held', Object.assign({}, good, { slate_date: '2026-09-16', games: [] }), T + 60000, []],
  ['a clean slate replaces everything', Object.assign({}, good, { games: [{ game_pk: 3 }] }), T + 60000, []]
];
scenarios.forEach(([label, p, now, wantHeld]) => {
  const a = client.holdRows(p, lkg, now);
  const b = edge.holdRows(p, lkg, now);
  check(JSON.stringify(a) === JSON.stringify(b), `client and edge disagree: ${label}`);
  check(JSON.stringify(a.held) === JSON.stringify(wantHeld), `${label}: held ${JSON.stringify(a.held)}, wanted ${JSON.stringify(wantHeld)}`);
  wantHeld.forEach((k) => check(a.payload[k] === good[k], `${label}: ${k} not restored from last good`));
  check(TK_ALL(a.payload), `${label}: a row is not an array after the merge`);
});
function TK_ALL(p) { return ['games', 'nfl_games', 'nba_games', 'nhl_games', 'cfb_games'].every((k) => Array.isArray(p[k])); }

/* ---------- 2. the browser ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

const read = (page) => page.evaluate(() => {
  const lane = document.querySelector('.ticker .ticker-games');
  const cards = [...lane.querySelectorAll('.gm')].filter((c) => !c.classList.contains('is-skel') && !c.classList.contains('is-msg'));
  return {
    mlb: cards.filter((c) => c.hasAttribute('data-game-pk')).length,
    nfl: cards.filter((c) => c.getAttribute('data-sport') === 'nfl').length,
    msg: (lane.querySelector('.gm.is-msg') || {}).textContent || '',
    skel: lane.querySelectorAll('.gm.is-skel').length,
    stale: document.querySelector('.ticker').classList.contains('is-stale'),
    delayedText: getComputedStyle(document.querySelector('.ticker .tlbl'), '::after').content
  };
});

(async () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const nflCard = { sport: 'nfl', id: 'espn:1', espn_event_id: '1', away: 'DEN', home: 'KC', away_team_name: 'Denver Broncos',
    home_team_name: 'Kansas City Chiefs', status: 'scheduled', start_time_pt: 'Thu 5:15 PM', href: '/sportsbook/' };
  const goodSlate = Object.assign({}, fixture, { nfl_games: [nflCard], nba_games: [], nhl_games: [], cfb_games: [] });
  const server = await serve();
  const browser = await chromium.launch();
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  const start = new Date(`${fixture.slate_date}T21:00:00-07:00`);
  let mode = 'good';
  let slateHits = 0;

  async function newPage(context) {
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)(?!trustmyrecord-api)/, (r) => r.abort());
    await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '{"ok":true}' }));
    await context.route('**/api/nav/mlb-slate*', (r) => {
      slateHits += 1;
      if (mode === 'good') return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(goodSlate) });
      if (mode === 'html') return r.fulfill({ status: 200, contentType: 'text/html', headers: CORS, body: '<!DOCTYPE html><html><body>Service restarting</body></html>' });
      if (mode === 'timeout') return r.abort('timedout');
      if (mode === 'empty') return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS,
        body: JSON.stringify(Object.assign({}, goodSlate, { games: [], degraded: true, mlb_available: false })) });
      if (mode === 'nfl-missing') {
        const p = Object.assign({}, goodSlate); delete p.nfl_games;
        return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(p) });
      }
      return r.abort();
    });
    await context.clock.install({ time: start });
    await context.clock.pauseAt(new Date(start.getTime() + 1000));
    const page = await context.newPage();
    page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    return page;
  }
  const settle = async (context, page, ms) => {
    for (let t = 0; t < ms; t += 500) { await context.clock.runFor(500); await page.waitForTimeout(15); }
  };

  /* --- an open page rides through the restart --- */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await newPage(ctx);
  await settle(ctx, page, 3000);
  const base = await read(page);
  check(base.mlb === fixture.games.length && base.nfl === 1, `good slate did not render: ${JSON.stringify(base)}`);

  for (const m of ['html', 'timeout', 'empty']) {
    mode = m;
    await settle(ctx, page, 91000);
    const r = await read(page);
    check(r.mlb === base.mlb && r.nfl === 1 && !r.msg, `${m}: the strip changed during one bad refresh: ${JSON.stringify(r)}`);
    check(!r.stale, `${m}: marked Delayed inside a normal restart window`);
  }
  mode = 'nfl-missing';
  await settle(ctx, page, 91000);
  let r = await read(page);
  check(r.mlb === base.mlb && r.nfl === 1, `a missing NFL row wiped the football card: ${JSON.stringify(r)}`);

  mode = 'good';
  await settle(ctx, page, 91000);
  r = await read(page);
  check(r.mlb === base.mlb && r.nfl === 1 && !r.stale && !r.msg, `a clean refresh did not restore a clean strip: ${JSON.stringify(r)}`);

  /* --- a long outage: Delayed first, unavailable only when the copy is old --- */
  mode = 'html';
  await settle(ctx, page, 6.5 * 60000);
  r = await read(page);
  check(r.mlb === base.mlb && !r.msg, `six minutes of failures took the cards down: ${JSON.stringify(r)}`);
  check(r.stale, 'six minutes without a clean refresh is not marked Delayed');
  check(/Delayed/.test(r.delayedText), `the label does not read Delayed: ${r.delayedText}`);
  await settle(ctx, page, 25 * 60000);
  r = await read(page);
  check(/unavailable/i.test(r.msg), `a thirty minute outage never said so: ${JSON.stringify(r)}`);
  await ctx.close();

  /* --- phone width, same restart --- */
  mode = 'good';
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pp = await newPage(phone);
  await settle(phone, pp, 3000);
  const pbase = await read(pp);
  mode = 'empty';
  await settle(phone, pp, 91000);
  r = await read(pp);
  check(r.mlb === pbase.mlb && pbase.mlb > 0 && !r.msg, `phone: degraded refresh changed the strip: ${JSON.stringify(r)}`);
  mode = 'html';
  await settle(phone, pp, 6.5 * 60000);
  r = await read(pp);
  const rule = await pp.evaluate(() => getComputedStyle(document.querySelector('.ticker .ticker-games')).boxShadow);
  check(r.stale && /inset/.test(rule), `phone: long failure not marked on the lane: ${JSON.stringify(r)} ${rule}`);
  await phone.close();

  /* --- first visit, nothing to fall back on --- */
  mode = 'html';
  const cold = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cp = await newPage(cold);
  await settle(cold, cp, 14000);
  r = await read(cp);
  check(!r.msg && r.skel > 0, `a first visit said unavailable after one failure: ${JSON.stringify(r)}`);
  await settle(cold, cp, 60000);
  r = await read(cp);
  check(/unavailable/i.test(r.msg), `three failed refreshes with nothing to show never said so: ${JSON.stringify(r)}`);
  mode = 'good';
  await settle(cold, cp, 91000);
  r = await read(cp);
  check(r.mlb > 0 && !r.msg, `the strip did not recover when the API did: ${JSON.stringify(r)}`);

  /* --- a return visit during the outage draws the stored copy --- */
  mode = 'html';
  const again = await cold.newPage();
  again.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
  await again.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await settle(cold, again, 3000);
  r = await read(again);
  check(r.mlb === pbase.mlb && !r.msg, `a return visit during an outage did not use the stored slate: ${JSON.stringify(r)}`);
  await cold.close();

  await browser.close();
  server.close();
  if (failures.length) {
    console.log(`ticker last known good FAILED (${failures.length}):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log(`ticker last known good passed (${cases.length * 2 + scenarios.length * 2} pure checks, ${slateHits} scripted slate answers)`);
})().catch((e) => { console.error(e); process.exit(1); });
