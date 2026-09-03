#!/usr/bin/env node
/* MULTISLIP verification for the 2026-09-03 UX pass.
 * Adds 2/3/4 selections, removes them from the ticket and from the board,
 * changes units, switches Risk / To Win, submits, and checks the contest flow
 * still uses the single-pick path. POST /api/picks is ALWAYS intercepted, so
 * nothing is recorded.
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/multipick.cjs --url <sportsbook url> --token <jwt file>
 */
const fs = require('fs');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
const TOKEN_PATH = (args.token && args.token.trim()) || process.env.TMR_TEST_JWT_FILE || '';
if (!TOKEN_PATH || !fs.existsSync(TOKEN_PATH)) { console.log('SKIP: no member JWT (pass --token <file> or set TMR_TEST_JWT_FILE).'); process.exit(0); }
const TOKEN = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
const BASE = args.url || 'https://trustmyrecord.com/sportsbook/';
const LABEL = args.label || 'multipick';
const API = 'https://trustmyrecord-api.onrender.com/api';
let failures = 0; const log = [];
function check(name, ok, d) { if (!ok) failures++; log.push({ name, ok, d }); let dd = ''; try { dd = JSON.stringify(d).slice(0, 300); } catch (_) {} console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' -> ' + dd}`); }
const url = (extra) => BASE + (BASE.indexOf('?') === -1 ? '?' : '&') + extra;

async function open(browser, viewport, extra) {
  const ctx = await browser.newContext({ viewport });
  await installOverlay(ctx);
  const me = await (await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  await ctx.addInitScript(({ user, token }) => { const s = JSON.stringify({ user }); localStorage.setItem('trustmyrecord_session', s); localStorage.setItem('currentUser', s); localStorage.setItem('trustmyrecord_token', token); localStorage.setItem('token', token); localStorage.setItem('tmr_token', token); localStorage.setItem('tmr_is_logged_in', 'true'); }, { user: me.user, token: TOKEN });
  const posts = [];
  await ctx.route(/\/api\/picks(\?.*)?$/, (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (_) {}
    posts.push(body);
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: 'dry-run', pick: Object.assign({ id: 1000 + posts.length }, body) }) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`${LABEL}: uncaught page error`, false, String(e.message).slice(0, 160)));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(url(extra), { waitUntil: 'domcontentloaded', timeout: 60000 });
  // A contest URL can bounce a member who has not joined that contest to its
  // registration page; that is product behaviour, not a slip failure.
  // The redirect is client-side, so race it against the board appearing.
  const board = await Promise.race([
    page.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 }).then(() => 'board').catch(() => 'timeout'),
    page.waitForURL(/\/contests\//, { timeout: 45000 }).then(() => 'contest').catch(() => 'timeout'),
  ]);
  if (board === 'contest' || /\/contests\//.test(page.url())) return { ctx, page, posts, redirectedTo: page.url() };
  if (board === 'timeout') throw new Error('board never rendered at ' + page.url());
  const cur = await page.evaluate(() => document.getElementById('lobbyBoardRows').getAttribute('data-sport'));
  if (cur !== 'MLB') {
    await page.locator('.sportsbook-rail-board[data-sport="MLB"]').first().click();
    await page.waitForFunction(() => document.getElementById('lobbyBoardRows').getAttribute('data-sport') === 'MLB' && document.querySelector('#lobbyBoardRows .sb-odds'), null, { timeout: 45000 });
  }
  await page.waitForTimeout(600);
  return { ctx, page, posts };
}
// Click the ML price on the Nth-from-last game that has prices. Returns its label.
async function tapGame(page, idx) {
  return page.evaluate((idx) => {
    const cards = [...document.querySelectorAll('#lobbyBoardRows .sportsbook-game-card')].filter((c) => c.querySelector('.sb-odds:not(.is-empty):not([disabled])'));
    const card = cards[cards.length - 1 - idx]; if (!card) return null;
    const names = [...card.querySelectorAll('.team-cell b')].map((b) => b.textContent.trim());
    const btn = card.querySelector('.team-market-row.home-team-row .odds-cell:nth-child(3) .sb-odds:not(.is-empty)') || card.querySelector('.sb-odds:not(.is-empty)');
    const price = (btn.querySelector('.sb-odds-price') || {}).textContent.trim();
    btn.scrollIntoView({ block: 'center' }); btn.click();
    return { home: names[1], away: names[0], price };
  }, idx);
}
async function slip(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.tmr-ms-card')];
    return {
      count: (document.querySelector('.tmr-ms-count') || {}).textContent,
      cards: cards.length,
      sels: cards.map((c) => (c.querySelector('.tmr-ms-sel') || {}).textContent),
      removes: document.querySelectorAll('.tmr-ms-remove').length,
      highlighted: document.querySelectorAll('#lobbyBoardRows .sb-odds.tmr-ms-on').length,
      units: [...document.querySelectorAll('.tmr-ms-units-input')].map((i) => i.value),
      steppers: document.querySelectorAll('.tmr-ms-units-row .tmr-ms-step').length,
      submitText: (document.querySelector('.tmr-ms-submit') || {}).textContent,
      mode: (() => { const on = document.querySelector('.tmr-ms-mode-btn.is-active, .tmr-ms-mode-btn.active, .tmr-ms-mode-btn[aria-pressed="true"]'); return on ? on.textContent.trim() : null; })(),
    };
  });
}

async function desktopFlow(browser) {
  const L = `${LABEL} desktop`;
  const { ctx, page, posts } = await open(browser, { width: 1440, height: 900 }, 'multislip=1');
  const g0 = await tapGame(page, 0); await page.waitForTimeout(700);
  let s = await slip(page);
  check(`${L}: 1st selection creates a pick card`, s.cards === 1 && s.count === '1' && s.highlighted === 1, s);
  const g1 = await tapGame(page, 1); await page.waitForTimeout(700);
  s = await slip(page);
  check(`${L}: 2nd selection ADDS (does not replace) -> 2 picks`, s.cards === 2 && s.count === '2' && s.highlighted === 2, s);
  const g2 = await tapGame(page, 2); await page.waitForTimeout(700);
  s = await slip(page);
  check(`${L}: 3rd selection -> 3 picks, 3 highlighted, 3 remove controls`, s.cards === 3 && s.count === '3' && s.highlighted === 3 && s.removes === 3, s);
  const g3 = await tapGame(page, 3); await page.waitForTimeout(700);
  s = await slip(page);
  check(`${L}: 4th selection -> 4 picks`, s.cards === 4 && s.count === '4' && s.highlighted === 4, s);
  check(`${L}: every card names its own selection`, new Set(s.sels).size === 4, s.sels);
  check(`${L}: submit button states the pick count`, /4/.test(s.submitText || ''), s.submitText);
  check(`${L}: per-card +/- steppers present (2 per card)`, s.steppers === 8, s.steppers);

  // remove one from the ticket
  await page.locator('.tmr-ms-remove').first().click(); await page.waitForTimeout(700);
  let s2 = await slip(page);
  check(`${L}: removing from the ticket -> 3 picks, highlight cleared`, s2.cards === 3 && s2.count === '3' && s2.highlighted === 3, s2);
  // remove one by clicking the highlighted board button again
  await page.evaluate(() => { const b = document.querySelector('#lobbyBoardRows .sb-odds.tmr-ms-on'); b.scrollIntoView({ block: 'center' }); b.click(); });
  await page.waitForTimeout(700);
  s2 = await slip(page);
  check(`${L}: clicking the selected line again removes it -> 2 picks`, s2.cards === 2 && s2.count === '2' && s2.highlighted === 2, s2);

  // units: per card and bulk
  const u = page.locator('.tmr-ms-units-input').first();
  await u.fill('2.5'); await u.dispatchEvent('input'); await u.dispatchEvent('change'); await page.waitForTimeout(400);
  s2 = await slip(page);
  check(`${L}: per-card units edit sticks (${s2.units.join(',')})`, s2.units[0] === '2.5', s2.units);
  await page.locator('.tmr-ms-units-row .tmr-ms-step').nth(1).click(); await page.waitForTimeout(400);
  s2 = await slip(page);
  check(`${L}: + stepper raises that card's units (${s2.units.join(',')})`, parseFloat(s2.units[0]) === 3, s2.units);
  const chips = page.locator('.tmr-ms-chip');
  if (await chips.count()) {
    await chips.nth(1).click(); await page.waitForTimeout(500);
    s2 = await slip(page);
    check(`${L}: "apply units to all" sets every card (${s2.units.join(',')})`, s2.units.every((v) => v === s2.units[0]), s2.units);
  }
  // Risk / To Win
  const modeBtns = page.locator('.tmr-ms-mode-btn');
  await modeBtns.nth(1).click(); await page.waitForTimeout(400);
  const m1 = await slip(page);
  await modeBtns.nth(0).click(); await page.waitForTimeout(400);
  const m0 = await slip(page);
  check(`${L}: Risk / To Win toggle switches mode (${m1.mode} -> ${m0.mode})`, m1.mode !== m0.mode, { m1: m1.mode, m0: m0.mode });

  // submit: one POST per pick, each with its own identity
  posts.length = 0;
  await page.locator('.tmr-ms-submit').click();
  // Submitting opens a "Confirm N Picks" modal listing every pick and the total
  // units; the last button is Confirm (the first is Back).
  const modal = page.locator('.tmr-ms-modal');
  await modal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const modalText = (await modal.count()) ? (await modal.innerText()).replace(/\s+/g, ' ') : '';
  check(`${L}: submit opens a confirmation listing both picks and the total units`, /Confirm 2 Picks/i.test(modalText) && /Total units/i.test(modalText), modalText.slice(0, 200));
  const confirm = page.locator('.tmr-ms-modal-btns button').last();
  if (await confirm.count()) { await confirm.click(); }
  await page.waitForTimeout(4000);
  check(`${L}: submitting 2 picks fires 2 POSTs`, posts.length === 2, posts.length);
  check(`${L}: each POST carries its own submission identity`, posts.length === 2 && posts[0].submission_batch_id && posts[1].submission_batch_id && posts[0].submission_batch_id !== posts[1].submission_batch_id, posts.map((p) => p.submission_batch_id));
  check(`${L}: each POST is a normal single pick (own game, market, odds, units)`, posts.every((p) => p.game_id && p.market_type && p.odds_snapshot != null && Number(p.units) > 0) && posts[0].game_id !== posts[1].game_id, posts.map((p) => ({ g: p.game_id, m: p.market_type, o: p.odds_snapshot, u: p.units })));
  await ctx.close();
}

async function contestFlow(browser) {
  const L = `${LABEL} contest`;
  const r = await open(browser, { width: 1440, height: 900 }, 'multislip=1&contest=justbet-mlb');
  const { ctx, page, posts } = r;
  const ms = await page.evaluate(() => !!document.querySelector('.tmr-ms-list') || !!(window.__tmrMultiSlip));
  check(`${L}: contest mode never installs the multi slip (stays on the proven single-pick path)`, ms === false, { multiSlipPresent: ms, url: page.url() });
  if (r.redirectedTo) {
    check(`${L}: contest entry redirects an unregistered member to registration (product behaviour)`, /\/contests\/.*register/.test(r.redirectedTo), r.redirectedTo);
    await ctx.close();
    return;
  }
  const g = await tapGame(page, 0); await page.waitForTimeout(800);
  const single = await page.evaluate(() => ({ sel: (document.querySelector('.sportsbook-ticket-preview-topline strong') || {}).textContent, submit: !!document.querySelector('#ttSlipSubmit') }));
  check(`${L}: a selection still populates the single-pick ticket`, !!single.sel && single.submit, single);
  await ctx.close();
}

async function mobileFlow(browser) {
  const L = `${LABEL} mobile`;
  const { ctx, page } = await open(browser, { width: 390, height: 844 }, 'multislip=1');
  await tapGame(page, 0); await page.waitForTimeout(700);
  await tapGame(page, 1); await page.waitForTimeout(700);
  await tapGame(page, 2); await page.waitForTimeout(900);
  const pill = await page.evaluate(() => { const p = document.querySelector('[class*="tmr-ms-pill"]'); return p ? { text: p.textContent.trim(), visible: p.getBoundingClientRect().height > 0 } : null; });
  check(`${L}: a slip pill shows the running count`, !!pill && pill.visible && /3/.test(pill.text), pill);
  await page.evaluate(() => document.querySelector('[class*="tmr-ms-pill"]').click());
  await page.waitForTimeout(900);
  const d = await page.evaluate(() => { const panel = document.querySelector('.tmr-ms-drawer-panel'); const sub = document.querySelector('.tmr-ms-drawer-body .tmr-ms-submit') || document.querySelector('.tmr-ms-submit'); const r = sub && sub.getBoundingClientRect();
    return { open: !!panel && panel.getBoundingClientRect().height > 0, cards: document.querySelectorAll('.tmr-ms-drawer-body .tmr-ms-card').length, panelH: panel ? Math.round(panel.getBoundingClientRect().height) : null, vh: innerHeight, submitVisible: !!r && r.bottom <= innerHeight + 1 && r.top >= 0, removes: document.querySelectorAll('.tmr-ms-drawer-body .tmr-ms-remove').length }; });
  check(`${L}: the drawer opens with all 3 picks and their remove controls`, d.open && d.cards === 3 && d.removes === 3, d);
  check(`${L}: the drawer stays within the viewport (${d.panelH} of ${d.vh}) and Submit is reachable`, d.panelH <= d.vh && d.submitVisible, d);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(`${L}: no horizontal overflow`, !overflow);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await desktopFlow(browser);
    await contestFlow(browser);
    await mobileFlow(browser);
  } catch (e) { check('suite: completed without harness exception', false, String(e && e.stack || e).slice(0, 500)); }
  await browser.close();
  if (args.report) fs.writeFileSync(args.report, JSON.stringify({ label: LABEL, url: BASE, failures, log }, null, 2));
  console.log(`== ${LABEL}: ${log.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
