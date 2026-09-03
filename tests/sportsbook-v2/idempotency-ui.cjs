#!/usr/bin/env node
/* PICK_IDEMPOTENCY_20260903 frontend key-lifecycle test (POST /api/picks is
 * ALWAYS answered locally; nothing is recorded).
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/idempotency-ui.cjs --url <sportsbook url> --label x --token <jwt>
 * Proves the key sent with Lock: present; identical across a rapid double-click,
 * a retry after failure and a re-press after success; different after a units
 * change, a stake-mode change, re-tapping the price, a refresh and back-nav.
 */
const fs = require('fs');
const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
const URL_ = args.url || 'https://trustmyrecord.com/sportsbook/';
const LABEL = args.label || 'idem-ui';
const TOKEN = fs.readFileSync(args.token, 'utf8').trim();
const API = 'https://trustmyrecord-api.onrender.com/api';
let failures = 0; const log = [];
function check(name, ok, d) { if (!ok) failures++; log.push({ name, ok, d }); let dd = ''; try { dd = JSON.stringify(d).slice(0, 300); } catch (_) {} console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' -> ' + dd}`); }

async function run(browser, viewport, vname) {
  const ctx = await browser.newContext({ viewport });
  await installOverlay(ctx);
  const me = await (await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  await ctx.addInitScript(({ user, token }) => { const s = JSON.stringify({ user }); localStorage.setItem('trustmyrecord_session', s); localStorage.setItem('currentUser', s); localStorage.setItem('trustmyrecord_token', token); localStorage.setItem('token', token); localStorage.setItem('tmr_token', token); localStorage.setItem('tmr_is_logged_in', 'true'); localStorage.setItem('tmr_multislip', '0'); }, { user: me.user, token: TOKEN });
  const posts = []; let failNext = 0;
  await ctx.route(/\/api\/picks(\?.*)?$/, (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (_) {}
    posts.push({ key: body.submission_batch_id, item: body.submission_item_key, units: body.units, mode: body.stake_mode, sel: body.selection, at: Date.now() });
    if (failNext > 0) { failNext--; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"simulated outage"}' }); }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: 'dry-run', pick: Object.assign({ id: 12345 }, body) }) });
  });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const L = `${LABEL} ${vname}`;
  const goto = async () => { await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 }); const cur = await page.evaluate(() => document.getElementById('lobbyBoardRows').getAttribute('data-sport')); if (cur !== 'MLB') { await page.locator('.sportsbook-rail-board[data-sport="MLB"]').first().click(); await page.waitForFunction(() => document.getElementById('lobbyBoardRows').getAttribute('data-sport') === 'MLB' && document.querySelector('#lobbyBoardRows .sb-odds'), null, { timeout: 45000 }); } await page.waitForTimeout(600); };
  const tap = async (col) => { await page.evaluate((col) => { const cards = [...document.querySelectorAll('#lobbyBoardRows .sportsbook-game-card')].filter((c) => c.querySelector('.sb-odds:not(.is-empty)')); const card = cards[cards.length - 1]; const b = card.querySelector(`.team-market-row.home-team-row .odds-cell:nth-child(${col}) .sb-odds:not(.is-empty)`) || card.querySelector('.sb-odds:not(.is-empty)'); b.scrollIntoView({ block: 'center' }); b.click(); }, col); await page.waitForTimeout(700); };
  const lock = async () => { await page.waitForFunction(() => !window.__tmrLockInFlight, null, { timeout: 20000 }).catch(() => {}); await page.locator('#ttSlipSubmit').dispatchEvent('click'); await page.waitForTimeout(1500); };
  const last = () => posts[posts.length - 1];
  const setUnits = async (u) => { const i = page.locator('#ttSlipUnits'); await i.fill(String(u)); await i.dispatchEvent('input'); await i.dispatchEvent('change'); await page.waitForTimeout(300); };

  await goto(); await tap(3);
  await lock(); const p1 = last();
  check(`${L}: Lock carries submission_batch_id + item key`, !!(p1 && p1.key && p1.item), p1);
  check(`${L}: key shape seed:hash`, !!p1 && /^[^:]{8,}:[0-9a-f]{1,8}$/.test(String(p1.key)), p1 && p1.key);
  // rapid double click on the same staged wager
  const n0 = posts.length;
  await page.locator('#ttSlipSubmit').dispatchEvent('click'); await page.locator('#ttSlipSubmit').dispatchEvent('click'); await page.waitForTimeout(1500);
  const dbl = posts.slice(n0);
  check(`${L}: rapid double-click -> ${dbl.length} POST(s), all same key as the first lock`, dbl.length >= 1 && dbl.every((p) => p.key === p1.key), dbl);
  // failure then retry: same key
  failNext = 1; await lock(); const pf = last(); await lock(); const pr = last();
  check(`${L}: retry after a 503 reuses the same key`, pf.key === p1.key && pr.key === p1.key, { pf: pf.key, pr: pr.key });
  // units change -> new key (same seed prefix, different hash)
  await setUnits(2); await lock(); const pu = last();
  check(`${L}: units change -> new key, same staging seed`, pu.key !== p1.key && pu.key.split(':')[0] === p1.key.split(':')[0] && Number(pu.units) === 2, { before: p1.key, after: pu.key, units: pu.units });
  // stake mode change -> new key
  await page.locator('#modeToWinTicket').click(); await page.waitForTimeout(300); await lock(); const pm = last();
  check(`${L}: Risk->To Win -> new key`, pm.key !== pu.key && pm.mode === 'to_win', { before: pu.key, after: pm.key, mode: pm.mode });
  await page.locator('#modeRiskTicket').click(); await page.waitForTimeout(300); await setUnits(0.5);
  // re-tap the same price -> new seed
  await tap(3); await lock(); const pt = last();
  check(`${L}: re-tapping the same price -> new staging seed`, pt.key.split(':')[0] !== p1.key.split(':')[0], { before: p1.key, after: pt.key });
  // a different market -> new seed and item stays the game
  await tap(4); await lock(); const pk = last();
  check(`${L}: different market -> new key, item key = game id`, pk.key !== pt.key && pk.item === pt.item, { pt, pk });
  // refresh -> re-stage -> new seed
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 }); await page.waitForTimeout(600);
  await tap(3); await lock(); const prf = last();
  check(`${L}: after refresh -> new seed`, prf.key.split(':')[0] !== pt.key.split(':')[0], { pt: pt.key, prf: prf.key });
  await page.goto('https://trustmyrecord.com/handicappers/', { waitUntil: 'domcontentloaded' }); await page.goBack({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 }); await page.waitForTimeout(600);
  await tap(3); await lock(); const pb = last();
  check(`${L}: after back-nav -> new seed`, pb.key.split(':')[0] !== prf.key.split(':')[0], { prf: prf.key, pb: pb.key });
  check(`${L}: every POST carried a key`, posts.every((p) => !!p.key), posts.filter((p) => !p.key).length);
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  await run(browser, { width: 1440, height: 900 }, 'desktop');
  await run(browser, { width: 390, height: 844 }, 'mobile');
  await browser.close();
  if (args.report) fs.writeFileSync(args.report, JSON.stringify({ label: LABEL, failures, log }, null, 2));
  console.log(`== ${LABEL}: ${log.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
