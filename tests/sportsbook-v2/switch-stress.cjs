#!/usr/bin/env node
/* STALE_BOARD_FIX_20260903 stress test.
 * Switches sports in every order that used to leave window.TMR.currentGames
 * stale, clicks a live price after each switch and proves the selection,
 * slip and submission payload all describe the game that was clicked.
 *
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/switch-stress.cjs \
 *     --url https://trustmyrecord.com/sportsbook/ --label classic --runs 3 --token <jwt file>
 * POST /api/picks is always answered locally (nothing is recorded).
 */
const fs = require('fs');
const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
const URL_ = args.url || 'https://trustmyrecord.com/sportsbook/';
const LABEL = args.label || 'run';
const RUNS = parseInt(args.runs || '3', 10);
const TOKEN = args.token ? fs.readFileSync(args.token, 'utf8').trim() : null;
const API = 'https://trustmyrecord-api.onrender.com/api';
const SPORT_KEY = { NFL: 'americanfootball_nfl', MLB: 'baseball_mlb', UFC: 'mma_ufc', Soccer: 'soccer', NBA: 'basketball_nba', NHL: 'icehockey_nhl', NCAAF: 'americanfootball_ncaaf', WNBA: 'basketball_wnba', Tennis: 'tennis' };

const SEQUENCES = [
  ['NFL*', 'MLB*', 'NFL*'],
  ['UFC', 'MLB*'],
  ['Soccer', 'MLB*'],
  ['MLB*', 'NFL*'],
  ['UFC*', 'NFL*', 'MLB*', 'UFC*', 'Soccer*', 'MLB*'],
  ['NFL', 'MLB', 'NFL', 'MLB', 'UFC', 'MLB', 'NFL*', 'MLB*'],   // rapid, click only at the end
];

let failures = 0, clicks = 0; const log = [];
function fail(msg, d) { failures++; log.push({ ok: false, msg, d }); console.log('FAIL ' + msg + ' ' + JSON.stringify(d).slice(0, 400)); }
function pass(msg) { log.push({ ok: true, msg }); }

async function sessionInit(context) {
  if (!TOKEN) return;
  const me = await (await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  await context.addInitScript(({ user, token }) => {
    const sess = JSON.stringify({ user });
    localStorage.setItem('trustmyrecord_session', sess); localStorage.setItem('currentUser', sess);
    localStorage.setItem('trustmyrecord_token', token); localStorage.setItem('token', token); localStorage.setItem('tmr_token', token);
    localStorage.setItem('tmr_is_logged_in', 'true'); localStorage.setItem('tmr_multislip', '0');
  }, { user: me.user, token: TOKEN });
}

async function waitBoard(page, sport, timeout = 45000) {
  await page.waitForFunction((s) => {
    const rows = document.getElementById('lobbyBoardRows');
    if (!rows || rows.getAttribute('data-sport') !== s) return false;
    if (rows.querySelector('.sb-odds')) return true;
    const e = rows.querySelector('.sportsbook-board-empty');
    return !!(e && !/Loading/i.test(e.textContent || ''));
  }, sport, { timeout });
}

async function switchSport(page, sport, rapid) {
  const btn = page.locator(`.sportsbook-rail-board[data-sport="${sport}"]`).first();
  const clickedOk = await btn.click({ timeout: 8000 }).then(() => true).catch(() => false);
  if (!clickedOk) {
    // A completed dry submit can leave the page on the confirmation step where the
    // rail is hidden; bring the board back exactly like the page's own controls do.
    await page.evaluate(() => { try { window.showPickStep && window.showPickStep('sportSelection'); } catch (_) {} });
    const ok2 = await btn.click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!ok2) {
      const dbg = await page.evaluate((sport) => {
        const b = document.querySelector(`.sportsbook-rail-board[data-sport="${sport}"]`);
        const r = b && b.getBoundingClientRect();
        const cs = b && getComputedStyle(b);
        const top = document.elementFromPoint(r ? r.left + r.width / 2 : 0, r ? r.top + r.height / 2 : 0);
        return { exists: !!b, rect: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], display: cs && cs.display, vis: cs && cs.visibility, activeSteps: [...document.querySelectorAll('.pick-step.active')].map((e) => e.id), picksActive: !!(document.getElementById('picks') && document.getElementById('picks').classList.contains('active')), covering: top && (top.tagName + '#' + top.id + '.' + String(top.className).slice(0, 60)), url: location.href };
      }, sport);
      console.log('RAIL CLICK BLOCKED', JSON.stringify(dbg));
      await page.screenshot({ path: (args.report || 'stress').replace(/\.json$/, '') + '-blocked.png' }).catch(() => {});
      throw new Error('rail click blocked for ' + sport);
    }
  }
  if (!rapid) {
    const ok = await waitBoard(page, sport).then(() => true).catch(() => false);
    if (!ok) console.log(`note: ${sport} board did not settle within 45s (feed stall), continuing`);
    await page.waitForTimeout(500);
  }
}

// Pick a random pickable price on a random card; return everything the DOM says about it.
async function clickRandomPrice(page, sport) {
  return page.evaluate((sport) => {
    const rows = document.getElementById('lobbyBoardRows');
    const cards = [...rows.querySelectorAll('.sportsbook-game-card')].filter((c) => c.querySelector('.sb-odds:not(.is-empty):not([disabled])'));
    if (!cards.length) return null;
    const card = cards[Math.floor(Math.random() * cards.length)];
    const cardIndex = [...rows.querySelectorAll('.sportsbook-game-card')].indexOf(card);
    const two = card.classList.contains('sportsbook-game-card--two-market-cols');
    const names = [...card.querySelectorAll('.team-cell b')].map((b) => b.textContent.trim());
    const rowsEls = [...card.querySelectorAll('.team-market-row')];
    const options = [];
    rowsEls.forEach((r, ri) => {
      [...r.querySelectorAll('.odds-cell')].forEach((cell, ci) => {
        const btn = cell.querySelector('.sb-odds:not(.is-empty):not([disabled])');
        if (!btn) return;
        const col = ci + 2; // nth-child index incl. team cell
        const market = two ? (col === 2 ? 'ml' : 'total') : (col === 2 ? 'spread' : col === 3 ? 'ml' : 'total');
        options.push({ ri, market, btn });
      });
    });
    if (!options.length) return null;
    const o = options[Math.floor(Math.random() * options.length)];
    const line = (o.btn.querySelector('.sb-odds-line') || {}).textContent || '';
    const price = (o.btn.querySelector('.sb-odds-price') || {}).textContent || '';
    o.btn.scrollIntoView({ block: 'center' });
    o.btn.click();
    return { sport: rows.getAttribute('data-sport'), cardIndex, away: names[0], home: names[1], side: o.ri === 0 ? 'away' : 'home', market: o.market, line: line.trim(), price: price.trim(), two };
  }, sport);
}

async function readState(page) {
  return page.evaluate(() => {
    const t = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
    const c = (window.TMR && window.TMR.currentSelectedPick) || {};
    const g = (window.TMR && window.TMR.currentGames) || [];
    return {
      pick: { gameId: c.gameId, sport: c.sport, team: c.team, away: c.awayTeam, home: c.homeTeam, odds: c.odds, line: c.line, betType: c.betType, marketType: c.marketType },
      slip: { selection: t('.sportsbook-ticket-preview-topline strong'), game: t('.tmr-ticket-row--game strong'), odds: t('.tmr-ticket-row--odds strong'), sport: t('.tmr-ticket-row--sport strong'), market: t('.tmr-ticket-row--market strong') },
      cgSport: g[0] && g[0].sport_key, cgLen: g.length, visibleSport: document.getElementById('lobbyBoardRows').getAttribute('data-sport'),
      submitEnabled: !!(document.getElementById('ttSlipSubmit') && !document.getElementById('ttSlipSubmit').disabled),
    };
  });
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const priceNum = (s) => parseInt(String(s).replace(/[^\d-]/g, ''), 10);

async function verifyClick(page, clicked, boards, label) {
  clicks++;
  await page.waitForTimeout(600);
  const st = await readState(page);
  const team = clicked.side === 'away' ? clicked.away : clicked.home;
  const expSportKey = SPORT_KEY[clicked.sport] || null;
  const ctx = { label, clicked, st };
  // 1. selection object
  if (norm(st.pick.away) !== norm(clicked.away) || norm(st.pick.home) !== norm(clicked.home)) fail(`${label}: currentSelectedPick matchup != clicked card`, ctx);
  else pass('matchup');
  if (String(st.pick.sport || '').toUpperCase() !== clicked.sport.toUpperCase()) fail(`${label}: pick.sport != visible sport`, ctx);
  if (priceNum(st.pick.odds) !== priceNum(clicked.price)) fail(`${label}: pick.odds != chip price`, ctx);
  if (clicked.market !== 'total' && norm(st.pick.team) !== norm(team)) fail(`${label}: pick.team != clicked team`, ctx);
  if (clicked.market === 'total' && !/over|under|rounds/i.test(String(st.pick.betType))) fail(`${label}: total click did not produce an over/under selection`, ctx);
  if (clicked.market === 'spread' && !/spread/i.test(String(st.pick.betType))) fail(`${label}: spread click did not produce a spread selection`, ctx);
  if (clicked.market === 'ml' && !/^ml$|h2h/i.test(String(st.pick.betType))) fail(`${label}: ML click did not produce an ML selection`, ctx);
  // 2. slip text
  if (!st.slip.game || st.slip.game.indexOf(clicked.away) === -1 || st.slip.game.indexOf(clicked.home) === -1) fail(`${label}: slip Game row != clicked matchup`, ctx);
  if (priceNum(st.slip.odds) !== priceNum(clicked.price)) fail(`${label}: slip odds != chip price`, ctx);
  if (clicked.market !== 'total' && (!st.slip.selection || st.slip.selection.indexOf(team) === -1)) fail(`${label}: slip selection does not name the clicked team`, ctx);
  // 3. shared games list now belongs to the visible sport
  if (expSportKey && st.cgSport && st.cgSport.indexOf(expSportKey.split('_')[0]) === -1 && !(clicked.sport === 'Soccer' && /soccer/.test(st.cgSport))) fail(`${label}: window.TMR.currentGames still holds ${st.cgSport} while ${clicked.sport} is visible`, ctx);
  // 4. game id must exist in the board feed for that sport
  const feed = boards[clicked.sport];
  if (feed && st.pick.gameId) {
    const g = feed.find((x) => x.id === st.pick.gameId);
    if (!g) fail(`${label}: pick.gameId ${st.pick.gameId} not in the ${clicked.sport} board feed`, ctx);
    else if (norm(g.away_team) !== norm(clicked.away) || norm(g.home_team) !== norm(clicked.home)) fail(`${label}: pick.gameId belongs to a different matchup in the feed`, { ...ctx, feedGame: [g.away_team, g.home_team] });
    else pass('feed');
  }
  // 5. submission payload (dry: POST answered locally)
  if (TOKEN && st.submitEnabled) {
    const respP = page.waitForRequest((r) => /\/api\/picks(\?|$)/.test(r.url()) && r.method() === 'POST', { timeout: 15000 }).catch(() => null);
    await page.locator('#ttSlipSubmit').dispatchEvent('click').catch(() => {}); // the classic quick-bet bar can sit over the slip button; a coordinate click would land on the bar
    const req = await respP;
    if (!req) fail(`${label}: no POST /api/picks after Lock`, ctx);
    else {
      let p = {}; try { p = req.postDataJSON(); } catch (_) {}
      const snap = p.game_snapshot || {};
      const pctx = { ...ctx, payload: { game_id: p.game_id, sport_key: p.sport_key, market_type: p.market_type, selection: p.selection, odds: p.odds_snapshot, line: p.line_snapshot, snapAway: snap.away_team, snapHome: snap.home_team } };
      if (p.game_id !== st.pick.gameId) fail(`${label}: payload.game_id != selected gameId`, pctx);
      if (expSportKey && p.sport_key !== expSportKey && !(clicked.sport === 'Soccer' && /soccer/.test(p.sport_key))) fail(`${label}: payload.sport_key ${p.sport_key} != ${expSportKey}`, pctx);
      if (norm(snap.away_team) !== norm(clicked.away) || norm(snap.home_team) !== norm(clicked.home)) fail(`${label}: payload.game_snapshot matchup != clicked`, pctx);
      if (priceNum(p.odds_snapshot) !== priceNum(clicked.price)) fail(`${label}: payload.odds_snapshot != chip price`, pctx);
      if (clicked.market !== 'total' && String(p.selection || '').indexOf(team) === -1) fail(`${label}: payload.selection does not name clicked team`, pctx);
      const expMarket = clicked.market === 'ml' ? /h2h/ : clicked.market === 'spread' ? /spread/ : /total|rounds/;
      if (!expMarket.test(String(p.market_type))) fail(`${label}: payload.market_type ${p.market_type} != ${clicked.market}`, pctx);
      pass('payload');
    }
    await page.waitForTimeout(400);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  for (let run = 1; run <= RUNS; run++) {
    for (const seq of SEQUENCES) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await installOverlay(context);
      await sessionInit(context);
      await context.route(/\/api\/picks(\?.*)?$/, (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (_) {}
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: 'dry-run', pick: Object.assign({ id: 0 }, body) }) });
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${LABEL} ${seq.join('>')}: ${String(e.message).slice(0, 160)}`));
      page.on('response', (r) => { if (r.status() === 401 || r.status() === 403) console.log(`auth-fail ${r.status()} ${r.request().method()} ${r.url().slice(0, 120)}`); });
      page.on('framenavigated', (f) => { if (f === page.mainFrame() && /\/login/.test(f.url())) console.log(`NAVIGATED TO LOGIN during ${seq.join('>')} at ${new Date().toISOString()}`); });
      const boards = {};
      page.on('response', async (r) => {
        const m = /\/api\/games\/board\/([a-z_]+)/.exec(r.url());
        if (m && r.status() === 200) { try { const j = await r.json(); const games = j.games || j; const sport = Object.keys(SPORT_KEY).find((k) => SPORT_KEY[k] === m[1]) || m[1]; boards[sport] = games; } catch (_) {} }
      });
      await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('#lobbyBoardRows .sb-odds, #lobbyBoardRows .sportsbook-board-empty', { timeout: 45000 });
      const label = `${LABEL} run${run} ${seq.join('>')}`;
      const rapid = seq.length > 6;
      for (let i = 0; i < seq.length; i++) {
        const sport = seq[i].replace('*', '');
        const doClick = seq[i].endsWith('*');
        const isRapid = rapid && !doClick;
        await switchSport(page, sport, isRapid);
        if (!doClick) continue;
        await waitBoard(page, sport).catch(() => {});
        const clicked = await clickRandomPrice(page, sport);
        if (!clicked) { console.log(`skip ${label} step ${i} (${sport}): no pickable prices`); continue; }
        await verifyClick(page, clicked, boards, `${label} step${i} ${sport} ${clicked.market}`);
      }
      await context.close();
    }
  }
  await browser.close();
  if (errors.length) fail('uncaught page errors', errors.slice(0, 5));
  const out = { label: LABEL, url: URL_, runs: RUNS, clicks, failures, log: log.filter((l) => !l.ok) };
  if (args.report) fs.writeFileSync(args.report, JSON.stringify(out, null, 2));
  console.log(`== ${LABEL}: ${clicks} verified clicks, ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
