#!/usr/bin/env node
/* UFC_ROUNDS_MAP_20260903 verification.
 * On the UFC board: rounds OVER, rounds UNDER and fighter MONEYLINE clicks must
 * produce the right event, matchup, odds, market_type, selection, slip text and
 * Lock payload; then the same after a reload and after leaving/returning.
 * Also re-checks MLB spread / ML / game total so nothing regressed.
 *
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/ufc-rounds.cjs --url <sportsbook url> --label x --token <jwt>
 * POST /api/picks is ALWAYS answered locally: this script never records a pick.
 */
const fs = require('fs');
const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
const URL_ = args.url || 'https://trustmyrecord.com/sportsbook/';
const LABEL = args.label || 'ufc';
const TOKEN = fs.readFileSync(args.token, 'utf8').trim();
const API = 'https://trustmyrecord-api.onrender.com/api';
let failures = 0; const log = [];
function check(name, ok, d) { if (!ok) failures++; log.push({ name, ok, d }); let dd = ''; try { dd = JSON.stringify(d).slice(0, 400); } catch (_) { dd = String(d); } console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' -> ' + dd}`); }
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const pnum = (s) => parseInt(String(s).replace(/[^\d-]/g, ''), 10);

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  await installOverlay(ctx);
  const me = await (await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  await ctx.addInitScript(({ user, token }) => { const s = JSON.stringify({ user }); localStorage.setItem('trustmyrecord_session', s); localStorage.setItem('currentUser', s); localStorage.setItem('trustmyrecord_token', token); localStorage.setItem('token', token); localStorage.setItem('tmr_token', token); localStorage.setItem('tmr_is_logged_in', 'true'); localStorage.setItem('tmr_multislip', '0'); }, { user: me.user, token: TOKEN });
  await ctx.route(/\/api\/picks(\?.*)?$/, (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (_) {}
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: 'dry-run', pick: Object.assign({ id: 0 }, body) }) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`${LABEL}: uncaught page error`, false, String(e.message).slice(0, 160)));
  return { ctx, page };
}
async function gotoSport(page, sport) {
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#lobbyBoardRows .sb-odds, #lobbyBoardRows .sportsbook-board-empty', { timeout: 45000 });
  await page.locator(`.sportsbook-rail-board[data-sport="${sport}"]`).first().click();
  await page.waitForFunction((s) => { const r = document.getElementById('lobbyBoardRows'); return r && r.getAttribute('data-sport') === s && (r.querySelector('.sb-odds') || /no /i.test(r.textContent)); }, sport, { timeout: 45000 });
  await page.waitForTimeout(600);
}
async function clickCell(page, cardIdx, row, col) {
  return page.evaluate(({ cardIdx, row, col }) => {
    const cards = [...document.querySelectorAll('#lobbyBoardRows .sportsbook-game-card')].filter((c) => c.querySelector('.sb-odds:not(.is-empty):not([disabled])'));
    const card = cards[cardIdx % cards.length]; if (!card) return null;
    const names = [...card.querySelectorAll('.team-cell b')].map((b) => b.textContent.trim());
    const btn = card.querySelector(`.team-market-row.${row}-team-row .odds-cell:nth-child(${col}) .sb-odds:not(.is-empty):not([disabled])`);
    if (!btn) return null;
    const line = (btn.querySelector('.sb-odds-line') || {}).textContent || ''; const price = (btn.querySelector('.sb-odds-price') || {}).textContent || '';
    btn.scrollIntoView({ block: 'center' }); btn.click();
    return { away: names[0], home: names[1], line: line.trim(), price: price.trim(), sport: document.getElementById('lobbyBoardRows').getAttribute('data-sport') };
  }, { cardIdx, row, col });
}
async function state(page) {
  return page.evaluate(() => { const t = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }; const c = (window.TMR && window.TMR.currentSelectedPick) || {}; return { pick: { gameId: c.gameId, sport: c.sport, team: c.team, away: c.awayTeam, home: c.homeTeam, odds: c.odds, line: c.line, betType: c.betType, marketType: c.marketType }, slip: { sel: t('.sportsbook-ticket-preview-topline strong'), game: t('.tmr-ticket-row--game strong'), odds: t('.tmr-ticket-row--odds strong'), market: t('.tmr-ticket-row--market strong') }, enabled: !!(document.getElementById('ttSlipSubmit') && !document.getElementById('ttSlipSubmit').disabled) }; });
}
async function waitLockIdle(page) { await page.waitForFunction(() => !window.__tmrLockInFlight, null, { timeout: 20000 }).catch(() => {}); }
async function lock(page) {
  await waitLockIdle(page);
  const reqP = page.waitForRequest((r) => /\/api\/picks(\?|$)/.test(r.url()) && r.method() === 'POST', { timeout: 30000 }).catch(() => null);
  const resP = page.waitForResponse((r) => /\/api\/picks(\?|$)/.test(r.url()) && r.request().method() === 'POST', { timeout: 30000 }).catch(() => null);
  await page.locator('#ttSlipSubmit').dispatchEvent('click');
  const req = await reqP; const res = await resP;
  let payload = null, body = null; try { payload = req && req.postDataJSON(); } catch (_) {} try { body = res && await res.json(); } catch (_) {}
  return { payload, status: res && res.status(), body };
}

async function verify(page, clicked, kind, label, doLock) {
  await page.waitForTimeout(700);
  const st = await state(page);
  const exp = { over: { mt: 'mma_total_rounds', sel: 'Over', bt: 'roundsover' }, under: { mt: 'mma_total_rounds', sel: 'Under', bt: 'roundsunder' }, ml: { mt: 'h2h', bt: 'ml' }, spread: { mt: 'spreads', bt: 'spread' }, total: { mt: 'totals', bt: /over|under/ } }[kind];
  check(`${label}: matchup ${clicked.away} vs ${clicked.home}`, norm(st.pick.away) === norm(clicked.away) && norm(st.pick.home) === norm(clicked.home) && st.slip.game && st.slip.game.indexOf(clicked.home) !== -1, st);
  check(`${label}: odds ${clicked.price}`, pnum(st.pick.odds) === pnum(clicked.price) && pnum(st.slip.odds) === pnum(clicked.price), st);
  check(`${label}: betType`, exp.bt instanceof RegExp ? exp.bt.test(st.pick.betType) : st.pick.betType === exp.bt, st.pick);
  if (kind === 'over' || kind === 'under') {
    check(`${label}: marketType mma_total_rounds`, st.pick.marketType === 'mma_total_rounds', st.pick);
    check(`${label}: slip says ${exp.sel} ${clicked.line.replace(/^[OU] /, '')} Rounds`, st.slip.sel && new RegExp('^' + exp.sel + ' ' + clicked.line.replace(/^[OU] /, '') + '( Rounds)?$').test(st.slip.sel), st.slip);
    check(`${label}: slip market label Total Rounds`, /Total Rounds/i.test(st.slip.market || ''), st.slip);
  } else if (kind === 'ml') {
    check(`${label}: marketType h2h`, st.pick.marketType === 'h2h', st.pick);
    check(`${label}: slip names the fighter/team`, st.slip.sel && st.slip.sel.indexOf(clicked.side === 'home' ? clicked.home : clicked.away) !== -1, st.slip);
  }
  if (!doLock) return null;
  if (args.units) { const u = page.locator('#ttSlipUnits'); await u.fill(String(args.units)); await u.dispatchEvent('input'); await u.dispatchEvent('change'); await page.waitForTimeout(300); }
  const r = await lock(page);
  const p = r.payload || {};
  check(`${label}: Lock POSTed (${r.status})`, !!r.payload && r.status && r.status < 300, r);
  check(`${label}: payload market_type ${exp.mt}`, p.market_type === exp.mt, { market_type: p.market_type, bet_type: p.bet_type });
  if (exp.sel) check(`${label}: payload selection ${exp.sel}`, p.selection === exp.sel, { selection: p.selection, label: p.selection_label });
  if (exp.sel) check(`${label}: payload line ${clicked.line.replace(/^[OU] /, '')}`, Number(p.line_snapshot) === Number(clicked.line.replace(/^[OU] /, '')), { line_snapshot: p.line_snapshot });
  check(`${label}: payload odds ${clicked.price}`, pnum(p.odds_snapshot) === pnum(clicked.price), { odds_snapshot: p.odds_snapshot });
  if (args.units) check(`${label}: payload units ${args.units}`, Number(p.units) === Number(args.units), { units: p.units });
  check(`${label}: payload event = clicked matchup`, p.game_snapshot && norm(p.game_snapshot.away_team) === norm(clicked.away) && norm(p.game_snapshot.home_team) === norm(clicked.home) && p.game_id === st.pick.gameId, { game_id: p.game_id, snap: p.game_snapshot && [p.game_snapshot.away_team, p.game_snapshot.home_team] });
  check(`${label}: payload sport_key mma_ufc`, p.sport_key === 'mma_ufc', p.sport_key);
  return r;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [vp, vname] of [[{ width: 1440, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'mobile']]) {
    const { ctx, page } = await newPage(browser, vp);
    const L = `${LABEL} ${vname}`;
    await gotoSport(page, 'UFC');
    // OVER (away row, col 3 on the two-market fight card), UNDER (home row, col 3), ML (away row, col 2)
    let c = await clickCell(page, 0, 'away', 3); check(`${L}: OVER chip present`, !!c && /^O /.test(c.line), c);
    if (c) await verify(page, c, 'over', `${L} OVER`, true);
    c = await clickCell(page, 1, 'home', 3); check(`${L}: UNDER chip present`, !!c && /^U /.test(c.line), c);
    if (c) await verify(page, c, 'under', `${L} UNDER`, true);
    c = await clickCell(page, 2, 'away', 2); c && (c.side = 'away'); check(`${L}: ML chip present`, !!c, c);
    if (c) await verify(page, c, 'ml', `${L} ML`, true);
    // refresh then re-select; leave and come back then re-select
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 });
    await page.locator('.sportsbook-rail-board[data-sport="UFC"]').first().click();
    await page.waitForFunction(() => document.getElementById('lobbyBoardRows').getAttribute('data-sport') === 'UFC' && document.querySelector('#lobbyBoardRows .sb-odds'), null, { timeout: 45000 });
    await page.waitForTimeout(600);
    c = await clickCell(page, 3, 'home', 3); if (c) await verify(page, c, 'under', `${L} after refresh UNDER`, true);
    await page.goto('https://trustmyrecord.com/handicappers/', { waitUntil: 'domcontentloaded' });
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 });
    await page.locator('.sportsbook-rail-board[data-sport="UFC"]').first().click();
    await page.waitForFunction(() => document.getElementById('lobbyBoardRows').getAttribute('data-sport') === 'UFC' && document.querySelector('#lobbyBoardRows .sb-odds'), null, { timeout: 45000 });
    await page.waitForTimeout(600);
    c = await clickCell(page, 4, 'away', 3); if (c) await verify(page, c, 'over', `${L} after back-nav OVER`, true);
    // regression: MLB spread / ML / total on the standard card
    await page.locator('.sportsbook-rail-board[data-sport="MLB"]').first().click();
    await page.waitForFunction(() => document.getElementById('lobbyBoardRows').getAttribute('data-sport') === 'MLB' && document.querySelector('#lobbyBoardRows .sb-odds'), null, { timeout: 45000 });
    await page.waitForTimeout(600);
    for (const [row, col, kind] of [['away', 2, 'spread'], ['home', 3, 'ml'], ['away', 4, 'total']]) {
      c = await clickCell(page, 0, row, col); if (c) { c.side = row; await page.waitForTimeout(600); const st = await state(page); const m = { spread: 'spreads', ml: 'h2h', total: 'totals' }[kind]; check(`${L} MLB ${kind}: marketType ${m}, odds ${c.price}`, st.pick.marketType === m && pnum(st.pick.odds) === pnum(c.price) && norm(st.pick.home) === norm(c.home), st.pick); }
    }
    await ctx.close();
  }
  await browser.close();
  if (args.report) fs.writeFileSync(args.report, JSON.stringify({ label: LABEL, url: URL_, failures, log }, null, 2));
  console.log(`== ${LABEL}: ${log.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
