#!/usr/bin/env node
/* SPORTSBOOK_V2_20260903 production health monitor for the gradual rollout.
 * Each cycle exercises BOTH sides on the live origin (?sbv2=0 classic and
 * ?sbv2=1 v2) at desktop + mobile, and samples the pick API for anomalies.
 * Nothing is recorded: POST /api/picks is answered locally.
 *
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/monitor.cjs --cycles 3 --interval 60 --token <jwt file>
 * Exit 0 = every cycle healthy. Exit 2 = an abnormal signal (caller rolls back to 0%).
 */
const fs = require('fs');
const { chromium } = require('playwright');
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
const CYCLES = parseInt(args.cycles || '1', 10);
const INTERVAL = parseInt(args.interval || '60', 10);
const TOKEN = args.token ? fs.readFileSync(args.token, 'utf8').trim() : null;
const API = 'https://trustmyrecord-api.onrender.com/api';
const IGNORE = /google-analytics|googletagmanager|doubleclick|favicon|fonts\.gstatic|clarity\.ms|propBets|\/avatar/;
const abnormal = [];
const START = Date.now();
function bad(msg, d) { abnormal.push({ msg, d, at: new Date().toISOString() }); console.log('ABNORMAL ' + msg + ' ' + JSON.stringify(d || '').slice(0, 300)); }

async function apiGet(p, token) {
  const r = await fetch(API + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, json: j };
}

async function sideCheck(browser, flag, viewport, name) {
  const ctx = await browser.newContext({ viewport });
  if (TOKEN) {
    const me = await apiGet('/auth/me', TOKEN);
    if (me.json && me.json.user) await ctx.addInitScript(({ user, token }) => {
      const sess = JSON.stringify({ user });
      localStorage.setItem('trustmyrecord_session', sess); localStorage.setItem('currentUser', sess);
      localStorage.setItem('trustmyrecord_token', token); localStorage.setItem('token', token); localStorage.setItem('tmr_token', token);
      localStorage.setItem('tmr_is_logged_in', 'true'); localStorage.setItem('tmr_multislip', '0');
    }, { user: me.json.user, token: TOKEN });
  }
  await ctx.route(/\/api\/picks(\?.*)?$/, (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (_) {}
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: 'dry-run', pick: Object.assign({ id: 0 }, body) }) });
  });
  const page = await ctx.newPage();
  const errs = [], fails = [], bad5 = [], tmrLog = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (/\[TMR\]/.test(m.text())) tmrLog.push(m.text().slice(0, 140)); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  page.on('requestfailed', (r) => { if (!IGNORE.test(r.url()) && !/ERR_ABORTED/.test((r.failure() || {}).errorText || '')) fails.push(r.url().slice(0, 120)); });
  page.on('response', (r) => { if (r.status() >= 500 && !IGNORE.test(r.url())) bad5.push(`${r.status()} ${r.url().slice(0, 120)}`); if (r.status() >= 400 && r.status() < 500 && /\/api\//.test(r.url()) && !IGNORE.test(r.url())) bad5.push(`${r.status()} ${r.url().slice(0, 120)}`); });
  const t0 = Date.now();
  let loaded = false;
  try {
    await page.goto(`https://trustmyrecord.com/sportsbook/?sbv2=${flag}&mon=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => { const r = document.getElementById('lobbyBoardRows'); return r && (r.querySelector('.sb-odds') || (r.querySelector('.sportsbook-board-empty') && !/Loading/.test(r.textContent))); }, null, { timeout: 45000 });
    // The lobby boots on the NBA rail entry and the default-board script hops to
    // the first sport with a slate a moment later; pin MLB so cycles compare alike.
    const cur = await page.evaluate(() => document.getElementById('lobbyBoardRows').getAttribute('data-sport'));
    if (cur !== 'MLB') {
      await page.locator('.sportsbook-rail-board[data-sport="MLB"]').first().click();
      await page.waitForFunction(() => { const r = document.getElementById('lobbyBoardRows'); return r && r.getAttribute('data-sport') === 'MLB' && (r.querySelector('.sb-odds') || (r.querySelector('.sportsbook-board-empty') && !/Loading/.test(r.textContent))); }, null, { timeout: 45000 });
      await page.waitForTimeout(500);
    }
    loaded = true;
  } catch (e) { bad(`${name}: page/board failed to load`, String(e.message).slice(0, 120)); }
  const info = loaded ? await page.evaluate(() => ({ v2: document.documentElement.classList.contains('tmr-sbv2'), rollout: window.__tmrSbV2 && window.__tmrSbV2.rolloutPercent, sport: document.getElementById('lobbyBoardRows').getAttribute('data-sport'), odds: document.querySelectorAll('#lobbyBoardRows .sb-odds:not(.is-empty)').length, cards: document.querySelectorAll('#lobbyBoardRows .sportsbook-game-card').length })) : null;
  if (info) {
    if (info.v2 !== (flag === 1)) bad(`${name}: flag mismatch (expected v2=${flag === 1})`, info);
    if (info.odds === 0) bad(`${name}: no odds rendered on ${info.sport}`, info);
    // select a price and dry-submit; the payload must describe the clicked game
    const clicked = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#lobbyBoardRows .sportsbook-game-card')].filter((c) => c.querySelector('.sb-odds:not(.is-empty):not([disabled])')).pop(); // latest start, never a game about to lock
      if (!card) return null;
      const names = [...card.querySelectorAll('.team-cell b')].map((b) => b.textContent.trim());
      const btn = card.querySelector('.team-market-row.home-team-row .odds-cell:nth-child(3) .sb-odds:not(.is-empty)') || card.querySelector('.sb-odds:not(.is-empty):not([disabled])');
      const price = (btn.querySelector('.sb-odds-price') || {}).textContent || '';
      btn.scrollIntoView({ block: 'center' }); btn.click();
      return { away: names[0], home: names[1], price: price.trim() };
    });
    if (clicked) {
      await page.waitForTimeout(700);
      const slip = await page.evaluate(() => ({ game: (document.querySelector('.tmr-ticket-row--game strong') || {}).textContent, odds: (document.querySelector('.tmr-ticket-row--odds strong') || {}).textContent, enabled: !!(document.getElementById('ttSlipSubmit') && !document.getElementById('ttSlipSubmit').disabled) }));
      if (!slip.game || slip.game.indexOf(clicked.home) === -1) bad(`${name}: slip game != clicked game`, { clicked, slip });
      if (String(slip.odds || '').replace(/\s/g, '') !== clicked.price.replace(/\s/g, '')) bad(`${name}: slip odds != chip`, { clicked, slip });
      if (TOKEN && slip.enabled) {
        let req = null;
        for (let attempt = 0; attempt < 2 && !req; attempt++) {
          await page.waitForFunction(() => !window.__tmrLockInFlight, null, { timeout: 20000 }).catch(() => {});
          const reqP = page.waitForRequest((r) => /\/api\/picks(\?|$)/.test(r.url()) && r.method() === 'POST', { timeout: 30000 }).catch(() => null);
          await page.locator('#ttSlipSubmit').dispatchEvent('click').catch(() => {}); // the classic quick-bet bar can sit over the slip button; a coordinate click would land on the bar
          req = await reqP;
        }
        if (!req) bad(`${name}: Lock did not reach /api/picks`, { clicked, lastTmrLog: tmrLog.slice(-14) });
        else {
          let p = {}; try { p = req.postDataJSON(); } catch (_) {}
          const snap = p.game_snapshot || {};
          if (snap.home_team !== clicked.home || snap.away_team !== clicked.away) bad(`${name}: payload snapshot != clicked game`, { clicked, snap: [snap.away_team, snap.home_team] });
          if (String(p.odds_snapshot) !== clicked.price.replace('+', '')) bad(`${name}: payload odds != chip`, { clicked, odds: p.odds_snapshot });
        }
      }
    } else bad(`${name}: no pickable price found`, info);
  }
  if (errs.length) bad(`${name}: JS/console errors`, errs.slice(0, 4));
  if (fails.length) bad(`${name}: failed requests`, fails.slice(0, 4));
  if (bad5.length) bad(`${name}: API error responses`, bad5.slice(0, 4));
  console.log(`${name}: ${loaded ? 'loaded' : 'FAILED'} in ${Date.now() - t0}ms ${JSON.stringify(info)} errs=${errs.length} fails=${fails.length} apiErr=${bad5.length}`);
  await ctx.close();
}

async function apiSample(prevIds) {
  const board = await apiGet('/games/board/baseball_mlb');
  const games = board.json && (board.json.games || []);
  if (board.status !== 200 || !games || !games.length) bad('API: MLB board unhealthy', { status: board.status, games: games && games.length });
  const recent = await apiGet('/picks?limit=60');
  const picks = (recent.json && recent.json.picks) || [];
  if (recent.status !== 200) bad('API: /picks unhealthy', recent.status);
  const seen = new Map(); const dups = [];
  for (const p of picks) {
    const k = [p.user_id, p.game_id, p.market_type, p.selection, p.line_snapshot, p.odds_snapshot].join('|');
    if (seen.has(k)) { const q = seen.get(k); if (Math.abs(Date.parse(p.created_at) - Date.parse(q.created_at)) < 10 * 60e3 && Date.parse(p.created_at) > START) dups.push([q.id, p.id]); }
    else seen.set(k, p);
  }
  const newIds = picks.map((p) => p.id).filter((id) => !prevIds.has(id));
  const malformed = picks.filter((p) => !p.selection || p.odds_snapshot == null || !p.game_id || !p.market_type);
  if (dups.length) bad('API: duplicate-looking picks created since monitor start', dups.slice(0, 5));
  if (malformed.length) bad('API: malformed picks in the latest sample', malformed.slice(0, 3).map((p) => p.id));
  console.log(`API: board ${board.status} (${games && games.length} games), latest ${picks.length} picks, ${newIds.length} new since last cycle, dups=${dups.length}, malformed=${malformed.length}`);
  return new Set(picks.map((p) => p.id));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  let prev = new Set();
  for (let c = 1; c <= CYCLES; c++) {
    console.log(`== cycle ${c}/${CYCLES} ${new Date().toISOString()}`);
    prev = await apiSample(prev);
    const order = (args.only || 'classic-desktop,v2-desktop,classic-mobile,v2-mobile').split(',');
    for (const n of order) {
      const flag = /^v2/.test(n) ? 1 : 0;
      const vp = /mobile/.test(n) ? { width: 390, height: 844 } : { width: 1440, height: 900 };
      await sideCheck(browser, flag, vp, n);
    }
    if (abnormal.length) break;
    if (c < CYCLES) await new Promise((r) => setTimeout(r, INTERVAL * 1000));
  }
  await browser.close();
  if (args.report) fs.writeFileSync(args.report, JSON.stringify({ when: new Date().toISOString(), abnormal }, null, 2));
  console.log(`== monitor: ${abnormal.length ? 'ABNORMAL (' + abnormal.length + ')' : 'HEALTHY'}`);
  process.exit(abnormal.length ? 2 : 0);
})();
