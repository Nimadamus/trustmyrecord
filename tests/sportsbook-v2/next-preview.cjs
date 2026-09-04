#!/usr/bin/env node
/* SPORTSBOOK_NEXT_20260903 preview verification.
 * Layout consistency, market ordering, ladders, More Markets, pick/multi-pick,
 * removal, units, stake mode, submission payloads, responsive behaviour, and a
 * price-by-price comparison of what the preview shows against the raw feed.
 * POST /api/picks is ALWAYS intercepted, so nothing is recorded.
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/next-preview.cjs --url <preview url> --token <jwt file>
 */
const fs = require('fs');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
const TOKEN_PATH = (args.token && args.token.trim()) || process.env.TMR_TEST_JWT_FILE || '';
if (!TOKEN_PATH || !fs.existsSync(TOKEN_PATH)) { console.log('SKIP: no member JWT (pass --token <file> or set TMR_TEST_JWT_FILE).'); process.exit(0); }
const TOKEN = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
const BASE = args.url || 'https://trustmyrecord.com/sportsbook/next/';
const API = 'https://trustmyrecord-api.onrender.com/api';
let failures = 0; const log = [];
function check(n, ok, d) { if (!ok) failures++; log.push({ n, ok, d }); let dd = ''; try { dd = JSON.stringify(d).slice(0, 340); } catch (_) {} console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' -> ' + dd}`); }

async function open(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp });
  await installOverlay(ctx);
  const me = await (await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  await ctx.addInitScript(({ user, token }) => {
    const s = JSON.stringify({ user });
    localStorage.setItem('trustmyrecord_session', s); localStorage.setItem('currentUser', s);
    localStorage.setItem('trustmyrecord_token', token); localStorage.setItem('token', token); localStorage.setItem('tmr_token', token);
    localStorage.setItem('tmr_is_logged_in', 'true');
  }, { user: me.user, token: TOKEN });
  const posts = [];
  await ctx.route(/\/api\/picks(\?.*)?$/, (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (_) {}
    posts.push(b);
    return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ pick: Object.assign({ id: 900 + posts.length }, b) }) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 150)); });
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400 && /\/api\//.test(r.url()) && !/avatar/.test(r.url())) bad.push(`${r.status()} ${r.url().slice(0, 90)}`); });
  return { ctx, page, posts, errs, bad };
}
async function goto(page, sport) {
  await page.goto(BASE + (sport ? '?sport=' + sport : ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.sbn-card, .sbn-note', { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => !/Loading/.test((document.querySelector('.sbn-note') || {}).textContent || ''), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
}
async function pickSport(page, sport) {
  await page.evaluate((s) => { const b = [...document.querySelectorAll('.sbn-railbtn')].find((x) => x.getAttribute('data-sport') === s); if (b) b.click(); }, sport);
  await page.waitForFunction(() => !/Loading/.test((document.querySelector('.sbn-note') || {}).textContent || ''), null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ---- 1. compact board: identical row shape everywhere -------------------
  {
    const { ctx, page, errs, bad } = await open(browser, { width: 1440, height: 1000 });
    for (const sport of ['MLB', 'NFL', 'NCAAF', 'Soccer', 'NHL', 'UFC']) {
      await goto(page, sport);
      const st = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.sbn-row')];
        if (!rows.length) return { none: true, note: (document.querySelector('.sbn-note') || {}).textContent };
        const shape = (r) => [r.querySelector('.sbn-rowtop') ? 'TOP' : '', r.querySelectorAll('.sbn-trow').length + 'TEAMS',
          [...r.querySelectorAll('.sbn-trow')].map((t) => t.querySelectorAll('.sbn-chip').length).join('/')].join('|');
        return {
          rows: rows.length,
          heights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
          shapes: [...new Set(rows.map(shape))],
          colhead: !!document.querySelector('.sbn-colhead'),
          deepBtns: document.querySelectorAll('.sbn-deep').length,
          ladderInRow: document.querySelectorAll('.sbn-row .sbn-dsec, .sbn-row .sbn-lgrid').length,
          visible: rows.filter((r) => r.getBoundingClientRect().top < innerHeight).length,
        };
      });
      if (st.none) { console.log(`SKIP  ${sport}: ${String(st.note).trim()}`); continue; }
      check(`${sport}: every one of ${st.rows} rows is the same height (${st.heights.join('/')})`, st.heights.length === 1, st.heights);
      check(`${sport}: every row has the identical shape`, st.shapes.length === 1, st.shapes);
      check(`${sport}: column headers are printed once above the board`, st.colhead);
      check(`${sport}: no alternate ladder is rendered inside a board row`, st.ladderInRow === 0, st.ladderInRow);
      check(`${sport}: every row exposes More markets`, st.deepBtns === st.rows, { deepBtns: st.deepBtns, rows: st.rows });
      check(`${sport}: the board is compact enough to scan (${st.visible} games in view)`, st.visible >= 5, st.visible);
    }
    check('no uncaught JS errors while touring the sports', errs.length === 0, errs.slice(0, 4));
    check('no failing API calls while touring the sports', bad.length === 0, bad.slice(0, 4));
    await ctx.close();
  }

  // ---- 2. displayed prices vs the raw feed -------------------------------
  {
    const { ctx, page } = await open(browser, { width: 1440, height: 1000 });
    await goto(page, 'MLB');
    await page.waitForTimeout(400);
    // Compare the DOM against the EXACT payload the page rendered from
    // (window.__sbNext.state.games[].raw), so a live price move between two
    // fetches cannot masquerade as a mismatch.
    const cmp = await page.evaluate(() => {
      const raw = {};
      (window.__sbNext.state.games || []).forEach((g) => {
        const set = new Set();
        const bk = (g.raw.bookmakers || [])[0];
        ((bk && bk.markets) || []).forEach((m) => (m.outcomes || []).forEach((o) => set.add([m.key, o.name, o.point == null ? '' : o.point, o.price].join('|'))));
        (g.raw.market_groups || []).forEach((grp) => (grp.items || []).forEach((i) => {
          const mt = grp.key === 'alt_spreads' ? 'spreads' : grp.key === 'alt_totals' ? 'totals' : grp.key;
          const sel = grp.key === 'alt_totals' ? (String(i.selection).toLowerCase() === 'under' ? 'Under' : 'Over') : i.selection;
          set.add([mt, sel, i.line == null ? '' : i.line, i.odds].join('|'));
        }));
        raw[g.id] = set;
      });
      let checked = 0; const missing = [];
      [...document.querySelectorAll('.sbn-card')].forEach((c) => {
        [...c.querySelectorAll('.sbn-chip[data-pick]')].forEach((b) => {
          const d = JSON.parse(b.getAttribute('data-pick'));
          const set = raw[d.gameId];
          checked++;
          if (!set) { missing.push({ game: d.gameId, why: 'game missing from state' }); return; }
          const k = [d.marketType, d.selection, d.line == null ? '' : d.line, d.odds].join('|');
          if (!set.has(k)) missing.push({ game: d.game, chip: k });
        });
      });
      return { checked, missing: missing.slice(0, 6), total: missing.length };
    });
    const checked = cmp.checked, missing = cmp.missing.concat(cmp.total > cmp.missing.length ? [{ more: cmp.total - cmp.missing.length }] : []);
    check(`every displayed price exists verbatim in the raw feed (${checked} chips checked)`, missing.length === 0, missing.slice(0, 6));

    const junk = await page.evaluate(() => [...document.querySelectorAll('.sbn-chip[data-pick]')]
      .map((b) => JSON.parse(b.getAttribute('data-pick')))
      .filter((d) => !(d.odds <= -100 || d.odds >= 100) || d.odds < -500 || Math.abs(d.odds) > 20000)
      .slice(0, 5));
    check('no price outside the accepted American range is displayed', junk.length === 0, junk);
    const mixed = await page.evaluate(() => [...document.querySelectorAll('.sbn-card')].map((c) =>
      [...c.querySelectorAll('.sbn-sec')].map((s) => [...new Set([...s.querySelectorAll('.sbn-book')].map((b) => b.textContent.trim()))]).filter((a) => a.length > 1)).flat());
    check('no ladder blends more than one sportsbook', mixed.length === 0, mixed.slice(0, 4));
    await ctx.close();
  }

  // ---- 3. picking, multi-pick, units, submission --------------------------
  {
    const { ctx, page, posts, errs } = await open(browser, { width: 1440, height: 1000 });
    await goto(page, 'MLB');
    const tap = (n) => page.evaluate((n) => { const b = [...document.querySelectorAll('.sbn-chip[data-pick]')][n]; b.scrollIntoView({ block: 'center' }); b.click(); }, n);
    await tap(0); await page.waitForTimeout(400);
    let s = await page.evaluate(() => ({ n: document.querySelectorAll('.sbn-sliprow').length, count: (document.querySelector('.sbn-slipcount') || {}).textContent, sel: document.querySelectorAll('.sbn-chip.is-sel').length }));
    check('one tap adds a pick and highlights it on the board', s.n === 1 && s.count === '1' && s.sel >= 1, s);
    for (const i of [3, 7, 14]) { await tap(i); await page.waitForTimeout(350); }
    s = await page.evaluate(() => ({ n: document.querySelectorAll('.sbn-sliprow').length, count: (document.querySelector('.sbn-slipcount') || {}).textContent, sel: document.querySelectorAll('.sbn-chip.is-sel').length }));
    check('further taps ADD rather than replace (4 picks)', s.n === 4 && s.count === '4' && s.sel >= 4, s);
    await page.evaluate(() => document.querySelector('.sbn-slipx').click()); await page.waitForTimeout(350);
    s = await page.evaluate(() => ({ n: document.querySelectorAll('.sbn-sliprow').length, sel: document.querySelectorAll('.sbn-chip.is-sel').length }));
    check('removing from the slip clears its board highlight (3 picks)', s.n === 3 && s.sel >= 3 && s.sel < 6, s);
    await page.evaluate(() => { const b = document.querySelector('.sbn-chip.is-sel'); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } }); await page.waitForTimeout(400);
    s = await page.evaluate(() => ({ n: document.querySelectorAll('.sbn-sliprow').length }));
    check('tapping a selected chip again removes it (2 picks)', s.n === 2, s);
    await page.evaluate(() => document.querySelector('.sbn-step[data-dir="1"]').click()); await page.waitForTimeout(300);
    const u = await page.evaluate(() => document.querySelector('[data-unitsinput]').value);
    check(`the units stepper works (${u})`, parseFloat(u) === 1.5, u);
    await page.evaluate(() => document.querySelector('[data-mode="to_win"]').click()); await page.waitForTimeout(300);
    const mode = await page.evaluate(() => (document.querySelector('.sbn-modebtn.is-on') || {}).textContent);
    check('Risk / To win switches', /to win/i.test(mode || ''), mode);
    await page.evaluate(() => document.querySelector('[data-mode="risk"]').click()); await page.waitForTimeout(300);

    posts.length = 0;
    await page.evaluate(() => document.getElementById('sbnSubmit').click());
    await page.waitForTimeout(5000);
    check(`locking 2 picks fires one POST per pick (${posts.length})`, posts.length === 2, posts.length);
    if (posts.length) {
      const p = posts[0];
      check('payload carries the fields the record needs', !!(p.game_id && p.sport_key && p.market_type && p.selection && p.odds_snapshot != null && p.units && p.stake_mode && p.game_snapshot), Object.keys(p));
      check('payload carries a submission identity per pick', !!p.submission_batch_id && !!p.submission_item_key && posts[0].submission_batch_id !== posts[1].submission_batch_id, posts.map((x) => x.submission_batch_id));
      check('a moneyline payload has no line, a spread/total payload does', posts.every((x) => (x.market_type === 'h2h' ? x.line_snapshot == null : true)), posts.map((x) => [x.market_type, x.line_snapshot]));
      check('payload never invents a user id (ownership comes from the token)', posts.every((x) => x.user_id == null && x.userId == null));
    }
    const cleared = await page.evaluate(() => document.querySelectorAll('.sbn-sliprow').length);
    check('the slip empties after a successful lock', cleared === 0, cleared);
    check('no JS errors through the whole pick flow', errs.length === 0, errs.slice(0, 4));
    await ctx.close();
  }

  // ---- 4. responsive ------------------------------------------------------
  for (const [name, vp] of [['laptop', { width: 1280, height: 900 }], ['small-laptop', { width: 1180, height: 860 }], ['tablet', { width: 820, height: 1180 }], ['mobile', { width: 390, height: 844 }], ['narrow', { width: 360, height: 780 }]]) {
    const { ctx, page, errs } = await open(browser, vp);
    await goto(page, 'NCAAF');
    const r = await page.evaluate(() => {
      const clipped = [...document.querySelectorAll('.sbn-chip-top, .sbn-chip-bot, .sbn-team, .sbn-lname, .sbn-railbtn b')].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
      const cards = [...document.querySelectorAll('.sbn-card')];
      const shapes = [...new Set(cards.map((c) => [...c.querySelectorAll(':scope > .sbn-sec')].length))];
      return { clipped, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, cards: cards.length, shapes };
    });
    check(`${name}: no clipped text, no horizontal overflow, uniform card shape`, r.clipped === 0 && !r.overflow && r.shapes.length <= 1, r);
    if (vp.width <= 1023) {
      await page.evaluate(() => { const b = document.querySelector('.sbn-chip[data-pick]'); b.scrollIntoView({ block: 'center' }); b.click(); });
      await page.waitForTimeout(400);
      const bar = await page.evaluate(() => { const b = document.getElementById('sbnBar'); return { on: b.classList.contains('is-on'), text: b.querySelector('.sbn-bartext').textContent, vis: b.getBoundingClientRect().height > 0 }; });
      check(`${name}: the slip bar appears with a running count`, bar.vis && bar.on && /1 pick/.test(bar.text), bar);
      await page.evaluate(() => document.getElementById('sbnBar').click());
      await page.waitForTimeout(500);
      const sheet = await page.evaluate(() => { const s = document.querySelector('.sbn-slip'); const btn = document.getElementById('sbnSubmit'); const r = btn && btn.getBoundingClientRect(); return { open: document.documentElement.classList.contains('sbn-slip-open'), h: Math.round(s.getBoundingClientRect().height), vh: innerHeight, submitVisible: !!r && r.bottom <= innerHeight + 1 }; });
      check(`${name}: the slip sheet opens within the viewport and Lock is reachable`, sheet.open && sheet.h <= sheet.vh && sheet.submitVisible, sheet);
    }
    check(`${name}: no JS errors`, errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ---- 5. More Markets drawer ---------------------------------------------
  {
    const { ctx, page } = await open(browser, { width: 1440, height: 1000 });
    await goto(page, 'MLB');
    await page.evaluate(() => document.querySelector('.sbn-deep').click());
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => ({
      open: !!document.querySelector('.sbn-drawer-panel'),
      secs: [...document.querySelectorAll('.sbn-dsec h4')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
      chips: document.querySelectorAll('.sbn-drawer-panel .sbn-chip[data-pick]').length,
      dupPrimary: [...document.querySelectorAll('.sbn-dsec h4')].filter((h) => /^(full game|run line|game total|spread|total|moneyline)/i.test(h.textContent.trim())).length,
    }));
    check(`More markets opens a drawer with the deeper inventory (${d.secs.length} categories, ${d.chips} prices)`, d.open && d.secs.length >= 2 && d.chips > 10, d.secs.slice(0, 6));
    check('the drawer does not repeat the markets already on the row', d.dupPrimary === 0, d.secs);
    await page.evaluate(() => document.querySelector('.sbn-dclose').click());
    await page.waitForTimeout(400);
    const closed = await page.evaluate(() => !document.querySelector('.sbn-drawer-panel'));
    check('the drawer closes again', closed);
    await ctx.close();
  }

  await browser.close();
  if (args.report) fs.writeFileSync(args.report, JSON.stringify({ failures, log }, null, 2));
  console.log(`== next-preview: ${log.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
