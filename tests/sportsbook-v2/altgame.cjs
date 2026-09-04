#!/usr/bin/env node
/* ALT_GAME_GROUPING_20260903 verification.
 * Every market for a matchup must live in ONE compact section: header, primary
 * markets, then collapsed alternate spreads and alternate totals. Also proves
 * the click contract still records the right market_type for a primary
 * moneyline, an alternate spread and an alternate total.
 * POST /api/picks is ALWAYS intercepted, so nothing is recorded.
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/altgame.cjs --url <sportsbook url> --token <jwt file>
 */
const fs = require('fs');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
const TOKEN_PATH = (args.token && args.token.trim()) || process.env.TMR_TEST_JWT_FILE || '';
if (!TOKEN_PATH || !fs.existsSync(TOKEN_PATH)) { console.log('SKIP: no member JWT (pass --token <file> or set TMR_TEST_JWT_FILE).'); process.exit(0); }
const TOKEN = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
const BASE = args.url || 'https://trustmyrecord.com/sportsbook/';
const SPORT = args.sport || 'MLB';
const API = 'https://trustmyrecord-api.onrender.com/api';
let failures = 0; const log = [];
function check(n, ok, d) { if (!ok) failures++; log.push({ n, ok, d }); let dd = ''; try { dd = JSON.stringify(d).slice(0, 320); } catch (_) {} console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' -> ' + dd}`); }

async function open(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp });
  await installOverlay(ctx);
  const me = await (await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  await ctx.addInitScript(({ user, token }) => {
    const s = JSON.stringify({ user });
    localStorage.setItem('trustmyrecord_session', s); localStorage.setItem('currentUser', s);
    localStorage.setItem('trustmyrecord_token', token); localStorage.setItem('token', token); localStorage.setItem('tmr_token', token);
    localStorage.setItem('tmr_is_logged_in', 'true'); localStorage.setItem('tmr_multislip', '0');
  }, { user: me.user, token: TOKEN });
  const posts = [];
  await ctx.route(/\/api\/picks(\?.*)?$/, (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (_) {}
    posts.push(b);
    return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ pick: Object.assign({ id: 1 }, b) }) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('uncaught page error', false, String(e.message).slice(0, 150)));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  return { ctx, page, posts };
}

async function gotoAlts(page, sport) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#lobbyBoardRows .sb-odds', { timeout: 45000 });
  await page.evaluate((s) => { const x = document.querySelector('.sportsbook-rail-board[data-sport="' + s + '"]'); if (x) x.click(); }, sport);
  await page.waitForFunction((s) => document.getElementById('lobbyBoardRows').getAttribute('data-sport') === s && document.querySelector('#lobbyBoardRows .sb-odds'), sport, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(700);
  // At narrower widths the market nav folds Alt Lines into a MORE dropdown.
  let ok = await page.evaluate(() => { const b = [...document.querySelectorAll('#lobbyPeriodBar button')].find((x) => /alt/i.test(x.textContent)); if (b) { b.click(); return true; } return false; });
  if (!ok) {
    await page.evaluate(() => { const m = [...document.querySelectorAll('#lobbyPeriodBar button, .sportsbook-period-bar button')].find((x) => /more/i.test(x.textContent)); if (m) m.click(); });
    await page.waitForTimeout(500);
    ok = await page.evaluate(() => { const b = [...document.querySelectorAll('.tmr-mktnav-menu button, [data-period="alts"]')].find((x) => /alt/i.test(x.textContent)); if (b) { b.click(); return true; } return false; });
  }
  if (!ok) return false;
  await page.waitForFunction(() => document.querySelector('#lobbyBoardRows .sb-altgame') || /no alternate|not offered|temporarily/i.test(document.getElementById('lobbyBoardRows').innerText), null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(900);
  return true;
}

async function lock(page) {
  await page.waitForFunction(() => !window.__tmrLockInFlight, null, { timeout: 15000 }).catch(() => {});
  await page.locator('#ttSlipSubmit').dispatchEvent('click');
  await page.waitForTimeout(2500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const VIEWPORTS = [['desktop', { width: 1440, height: 900 }], ['laptop', { width: 1280, height: 800 }], ['tablet', { width: 820, height: 1180 }], ['mobile', { width: 390, height: 844 }]];
  for (const [vname, vp] of VIEWPORTS) {
    const { ctx, page, posts } = await open(browser, vp);
    const found = await gotoAlts(page, SPORT);
    if (!found) { check(`${vname}: ${SPORT} exposes an Alt Lines tab`, false); await ctx.close(); continue; }
    const st = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#lobbyBoardRows .sb-altgame')];
      if (!cards.length) return { none: true, text: document.getElementById('lobbyBoardRows').innerText.slice(0, 140) };
      const c = cards[0];
      const clipped = [...document.querySelectorAll('.sb-altgame .sb-altbtn-line, .sb-altgame .sb-altbtn-odds, .sb-altgame .sb-altp-team, .sb-altgame .sb-altrow-label')]
        .filter((e) => e.scrollWidth > e.clientWidth + 1).length;
      return {
        cards: cards.length,
        secTitles: [...c.querySelectorAll('.sb-altsec-title')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
        heights: cards.slice(0, 6).map((x) => Math.round(x.getBoundingClientRect().height)),
        hasHead: !!c.querySelector('.sb-altgame-head'),
        hasPrimary: !!c.querySelector('.sb-altsec--primary'),
        primaryBtns: c.querySelectorAll('.sb-altsec--primary .sb-altbtn[data-alt-pick]').length,
        visibleBtns: [...c.querySelectorAll('.sb-altbtn')].filter((b) => b.offsetParent !== null).length,
        totalBtns: c.querySelectorAll('.sb-altbtn').length,
        moreBtns: c.querySelectorAll('.sb-altmore').length,
        clipped,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        allPickable: [...document.querySelectorAll('.sb-altgame .sb-altbtn:not(.is-empty)')].every((b) => b.getAttribute('data-alt-pick') === '1' && b.getAttribute('data-odds')),
      };
    });
    if (st.none) { check(`${vname}: alt board rendered`, false, st.text); await ctx.close(); continue; }
    check(`${vname}: each matchup is one card with its own header (${st.cards} games)`, st.cards > 0 && st.hasHead, st.cards);
    check(`${vname}: primary markets sit at the top of the matchup`, st.hasPrimary && st.primaryBtns >= 3, { primaryBtns: st.primaryBtns });
    check(`${vname}: order is primary, then alternate spreads, then alternate totals`, /primary/i.test(st.secTitles[0] || '') && st.secTitles.some((t) => /alternate spreads/i.test(t)) && st.secTitles.some((t) => /alternate totals/i.test(t)), st.secTitles);
    check(`${vname}: alternates start collapsed (${st.visibleBtns} of ${st.totalBtns} shown)`, st.totalBtns > st.visibleBtns && st.moreBtns > 0, { visibleBtns: st.visibleBtns, totalBtns: st.totalBtns, moreBtns: st.moreBtns });
    check(`${vname}: a matchup fits on screen instead of a wall (tallest ${Math.max.apply(null, st.heights)}px)`, Math.max.apply(null, st.heights) < 800, st.heights);
    check(`${vname}: no clipped team names, lines or prices`, st.clipped === 0, st.clipped);
    check(`${vname}: no horizontal page overflow`, !st.overflow);
    check(`${vname}: every visible price is a wired pick button`, st.allPickable);

    const before = st.visibleBtns;
    await page.evaluate(() => { const b = document.querySelector('.sb-altgame .sb-altmore'); if (b) b.click(); });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => { const c = document.querySelector('#lobbyBoardRows .sb-altgame'); return { vis: [...c.querySelectorAll('.sb-altbtn')].filter((b) => b.offsetParent !== null).length }; });
    check(`${vname}: "View more" expands inline inside that matchup (${before} -> ${after.vis})`, after.vis > before, after);

    if (vname === 'desktop') {
      posts.length = 0;
      await page.evaluate(() => { const b = document.querySelector('.sb-altsec--primary .sb-altbtn[data-bet-type="ml"]'); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } });
      await page.waitForTimeout(900);
      const slip = await page.evaluate(() => ({ sel: (document.querySelector('.sportsbook-ticket-preview-topline strong') || {}).textContent }));
      check('desktop: the primary moneyline populates the slip', !!slip.sel && /ML/i.test(slip.sel), slip);
      await lock(page);
      check('desktop: primary moneyline records market_type h2h with no line', posts.length === 1 && posts[0].market_type === 'h2h' && posts[0].line_snapshot == null, posts[0] && { mt: posts[0].market_type, line: posts[0].line_snapshot, sel: posts[0].selection });

      posts.length = 0;
      await page.evaluate(() => { const b = [...document.querySelectorAll('.sb-altsec .sb-altbtn[data-bet-type="spread"]')].pop(); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } });
      await page.waitForTimeout(900);
      await lock(page);
      check('desktop: an alternate spread records market_type spreads with its line', posts.length === 1 && posts[0].market_type === 'spreads' && posts[0].line_snapshot != null, posts[0] && { mt: posts[0].market_type, line: posts[0].line_snapshot, sel: posts[0].selection, odds: posts[0].odds_snapshot });

      posts.length = 0;
      await page.evaluate(() => { const b = [...document.querySelectorAll('.sb-altsec .sb-altbtn[data-bet-type="over"], .sb-altsec .sb-altbtn[data-bet-type="under"]')].pop(); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } });
      await page.waitForTimeout(900);
      await lock(page);
      check('desktop: an alternate total records market_type totals with its line', posts.length === 1 && posts[0].market_type === 'totals' && posts[0].line_snapshot != null && /^(Over|Under)$/.test(posts[0].selection), posts[0] && { mt: posts[0].market_type, line: posts[0].line_snapshot, sel: posts[0].selection });
    }
    await ctx.close();
  }
  await browser.close();
  if (args.report) fs.writeFileSync(args.report, JSON.stringify({ failures, log }, null, 2));
  console.log(`== altgame: ${log.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
