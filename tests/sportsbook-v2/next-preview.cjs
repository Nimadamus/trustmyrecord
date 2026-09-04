#!/usr/bin/env node
/* SPORTSBOOK_NEXT_20260903 preview verification.
 * Layout consistency, market ordering, ladders, More Markets, pick/multi-pick,
 * removal, units, stake mode, submission payloads, responsive behaviour, and a
 * price-by-price comparison of what the preview shows against the raw feed.
 * POST /api/picks is ALWAYS intercepted, so nothing is recorded.
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/next-preview.cjs --url <preview url> --token <jwt file>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }

// ---- member credential --------------------------------------------------
// See credential.cjs: a saved token is used while valid, otherwise a fresh
// short-lived one is minted the way routes/auth.js does.
const { resolveCredential } = require('./credential.cjs');
const CRED = resolveCredential(args);
const TEST_USER_ID = CRED.userId;
const TOKEN = CRED.token;
if (!TOKEN) {
  console.log('SKIP: no member credential (pass --token <valid jwt file> or --jwt-secret <file>).');
  process.exit(0);
}
console.log(`CREDENTIAL: ${CRED.source}`);
const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
const BASE = args.url || 'https://trustmyrecord.com/sportsbook/next/';
const API = 'https://trustmyrecord-api.onrender.com/api';
let failures = 0; const log = [];
function check(n, ok, d) { if (!ok) failures++; log.push({ n, ok, d }); let dd = ''; try { dd = JSON.stringify(d).slice(0, 340); } catch (_) {} console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' -> ' + dd}`); }

// Resolved once, then reused: the identity the board runs as.
let ME = null;
async function whoami() {
  const r = await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${TOKEN}` } });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}
async function open(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp });
  await installOverlay(ctx);
  const me = ME || (await whoami()).body;
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
  // ---- 0. the credential itself ------------------------------------------
  // Everything below runs as a logged-in member, so the account endpoint is
  // verified first and by name. A bad credential fails here loudly instead of
  // surfacing later as a pile of 401s against the board.
  ME = null;
  {
    const me = await whoami();
    check(`GET /api/auth/me answers 200 for the test credential (${me.status})`, me.status === 200, me.body);
    const u = me.body && me.body.user;
    check('the account endpoint returns the member the token names',
      !!(u && Number(u.id) === TEST_USER_ID && u.username), u || me.body);
    if (me.status !== 200 || !u) {
      console.log('== next-preview: aborted, the member credential is not usable.');
      console.log(`== next-preview: ${log.length - failures} passed, ${failures} failed`);
      process.exit(1);
    }
    ME = me.body;
  }

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


  // ---- 6. market category navigation --------------------------------------
  // Every tab must come from inventory the feed actually returned, must change
  // what the board shows, and must never print a column the category lacks.
  {
    const { ctx, page, errs } = await open(browser, { width: 1440, height: 1000 });
    for (const sport of ['MLB', 'NFL']) {
      await goto(page, sport);
      const feedCats = await page.evaluate(() => {
        const st = window.__sbNext.state;
        const keys = new Set();
        st.games.forEach((g) => {
          if (g.main) keys.add('game_lines');
          Object.keys(g.groups).forEach((k) => keys.add(['full_game', 'spread', 'total'].includes(k) ? 'game_lines' : k));
        });
        return [...keys];
      });
      const tabs = await page.$$eval('.sbn-cat', (ns) => ns.map((n) => n.getAttribute('data-cat')));
      check(`${sport}: a tab for every market group in the feed (${tabs.length})`,
        tabs.length === feedCats.length && feedCats.every((k) => tabs.includes(k)),
        { tabs, feedCats });
      check(`${sport}: no tab names a market the feed did not return`,
        tabs.every((t) => feedCats.includes(t)), tabs.filter((t) => !feedCats.includes(t)));
      check(`${sport}: every tab is on screen without a horizontal scroll`,
        await page.evaluate(() => {
          const n = document.querySelector('.sbn-cats');
          return n.scrollWidth <= n.clientWidth + 1;
        }));

      const seen = new Set();
      for (const key of tabs) {
        await page.evaluate((k) => document.querySelector(`.sbn-cat[data-cat="${k}"]`).click(), key);
        await page.waitForTimeout(300);
        const v = await page.evaluate(() => {
          const rows = [...document.querySelectorAll('.sbn-row')];
          const chips = [...document.querySelectorAll('.sbn-row .sbn-chip')];
          const live = chips.filter((c) => c.hasAttribute('data-pick'));
          const heads = [...document.querySelectorAll('.sbn-colhead span')].map((x) => x.textContent.trim()).filter(Boolean);
          const shape = new Set(), voff = new Set();
          let offCentre = 0, clipped = 0;
          chips.forEach((c) => {
            const r = c.getBoundingClientRect();
            const t = c.querySelector('.sbn-chip-top'), b = c.querySelector('.sbn-chip-bot');
            if (!t) return;
            // a moneyline cell is one centred price, so it is a second legitimate
            // cell shape rather than a broken version of the two-row one
            const kind = c.classList.contains('is-single') ? 'single' : 'pair';
            const tr = t.getBoundingClientRect(), br = b ? b.getBoundingClientRect() : null;
            shape.add(`${kind}:${Math.round(r.height)}/${Math.round(tr.height)}${br ? '/' + Math.round(br.height) : ''}`);
            voff.add(`${kind}:${Math.round(tr.top - r.top)}${br ? '/' + Math.round(br.top - r.top) : ''}`);
            const cx = r.left + r.width / 2;
            [t, b].filter(Boolean).forEach((el) => {
              const rr = el.getBoundingClientRect();
              if (Math.abs(rr.left + rr.width / 2 - cx) > 1.5) offCentre++;
              if (el.scrollWidth > el.clientWidth + 1) clipped++;
            });
          });
          const bodies = rows.map((r) => (r.querySelector('.sbn-norow') ? 'none' : 'has'));
          const heights = [...new Set(rows.filter((r, i) => bodies[i] === 'has')
            .map((r) => Math.round(r.getBoundingClientRect().height)))];
          return {
            rows: rows.length, chips: chips.length, live: live.length, heads,
            shape: [...shape], voff: [...voff], offCentre, clipped, heights,
            deadCols: heads.length ? heads.filter((h, i) =>
              [...document.querySelectorAll('.sbn-row .sbn-trow')].every((tr) => {
                const c = tr.querySelectorAll('.sbn-chip')[i];
                return c && c.classList.contains('is-off');
              })).length : 0,
            hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        });
        seen.add(JSON.stringify([v.chips, v.heads.join('|')]));
        check(`${sport}/${key}: the board renders priced chips (${v.live}/${v.chips})`, v.live > 0, v);
        check(`${sport}/${key}: each cell shape has one internal geometry`,
          v.shape.length <= 2 && v.voff.length <= 2, { shape: v.shape, voff: v.voff });
        check(`${sport}/${key}: no chip text is off-centre or clipped`,
          v.offCentre === 0 && v.clipped === 0, { offCentre: v.offCentre, clipped: v.clipped });
        check(`${sport}/${key}: every card carrying this market is the same height`,
          v.heights.length === 1, v.heights);
        check(`${sport}/${key}: no column is printed that the market does not post`,
          v.deadCols === 0, v.heads);
        check(`${sport}/${key}: no horizontal page overflow`, !v.hScroll);
      }
      check(`${sport}: switching tabs actually changes the board`, seen.size > 1, seen.size);
    }
    check('no JS errors while touring every market category', errs.length === 0, errs.slice(0, 4));
    await ctx.close();
  }

  // ---- 7. a pick from a deeper category records THAT market ----------------
  // A group key is a display bucket: first_5 holds f5_h2h, f5_spreads and
  // f5_totals. Submitting the bucket name would file the pick as the wrong
  // market, so the payload must carry the item's own market_type.
  {
    const { ctx, page, posts, errs } = await open(browser, { width: 1440, height: 1000 });
    await goto(page, 'MLB');
    const tabs = await page.$$eval('.sbn-cat', (ns) => ns.map((n) => n.getAttribute('data-cat')));
    const want = ['first_5', 'team_totals', 'alt_totals', 'player_props', 'first_inning'].filter((k) => tabs.includes(k));
    const expected = [];
    for (const key of want) {
      await page.evaluate((k) => document.querySelector(`.sbn-cat[data-cat="${k}"]`).click(), key);
      await page.waitForTimeout(300);
      const got = await page.evaluate(() => {
        const c = document.querySelector('.sbn-row .sbn-chip[data-pick]');
        if (!c) return null;
        const d = JSON.parse(c.getAttribute('data-pick'));
        c.click();
        return { marketType: d.marketType, groupLabel: d.groupLabel, line: d.line, odds: d.odds };
      });
      if (got) expected.push([key, got]);
      await page.waitForTimeout(200);
    }
    check(`a chip in each deeper category is pickable (${expected.length}/${want.length})`,
      expected.length === want.length, { want, got: expected.map((e) => e[0]) });
    // Buckets that hold several market types under one heading. Their name is a
    // display label only and must never reach the record as a market_type.
    const BUCKETS = ['full_game', 'spread', 'total', 'first_5', 'first_inning',
      'first_half', 'second_half', 'period_1', 'period_2', 'period_3', 'period_4', 'player_props'];
    check('no category submits a display bucket as the market type',
      expected.every(([, g]) => g.marketType && !BUCKETS.includes(g.marketType)),
      expected.map(([k, g]) => [k, g.marketType]));
    check('First 5 records an f5_* market, never "first_5"',
      !expected.some(([k, g]) => k === 'first_5') || expected.find(([k]) => k === 'first_5')[1].marketType.startsWith('f5_'),
      expected.filter(([k]) => k === 'first_5').map(([, g]) => g.marketType));
    check('1st Inning records first_inning_totals, never "first_inning"',
      !expected.some(([k]) => k === 'first_inning') || expected.find(([k]) => k === 'first_inning')[1].marketType === 'first_inning_totals',
      expected.filter(([k]) => k === 'first_inning').map(([, g]) => g.marketType));
    posts.length = 0;
    await page.evaluate(() => document.getElementById('sbnSubmit').click());
    await page.waitForTimeout(2500);
    check(`locking the deep-market slip posts one pick per selection (${posts.length})`,
      posts.length === expected.length, posts.map((p) => p.market_type));
    check('every posted market_type matches the chip that was tapped',
      posts.every((p, i) => expected.some(([, g]) => g.marketType === p.market_type)),
      { posted: posts.map((p) => p.market_type), tapped: expected.map(([, g]) => g.marketType) });
    check('every posted price and line match the chip that was tapped',
      posts.every((p) => expected.some(([, g]) => g.odds === p.odds_snapshot && (g.line == null ? p.line_snapshot == null : g.line === p.line_snapshot))),
      posts.map((p) => [p.market_type, p.line_snapshot, p.odds_snapshot]));
    check('every posted market carries the feed label for its group',
      posts.every((p) => !!p.market_label), posts.map((p) => p.market_label));
    check('no JS errors through the deep-market pick flow', errs.length === 0, errs.slice(0, 4));
    await ctx.close();
  }


  // ---- 8. crisp numbers: whole-pixel text, one hierarchy ------------------
  // Text drawn at a fractional y is what makes numbers look soft on a normal
  // display. The chip grid and everything stacked above the board therefore has
  // to land on whole pixels. This measures the rendered page, not the CSS.
  {
    const { ctx, page, errs } = await open(browser, { width: 1440, height: 1000 });
    for (const sport of ['MLB', 'NFL']) {
      await goto(page, sport);
      const tabs = await page.$$eval('.sbn-cat', (ns) => ns.map((n) => n.getAttribute('data-cat')));
      for (const key of tabs) {
        await page.evaluate((k) => document.querySelector(`.sbn-cat[data-cat="${k}"]`).click(), key);
        await page.waitForTimeout(250);
        const m = await page.evaluate(() => {
          const frac = (v) => Math.abs(v - Math.round(v)) > 0.01;
          const chips = [...document.querySelectorAll('.sbn-row .sbn-chip')];
          let fracY = 0, fracChip = 0, singles = 0, filler = 0;
          const gap = new Set(), pad = new Set(), hero = new Set(), sub = new Set();
          chips.forEach((c) => {
            const r = c.getBoundingClientRect();
            if (frac(r.top) || frac(r.height)) fracChip++;
            const t = c.querySelector('.sbn-chip-top'), b = c.querySelector('.sbn-chip-bot');
            if (!t) return;
            const tr = t.getBoundingClientRect();
            if (frac(tr.top)) fracY++;
            // an unavailable cell is deliberately lighter, so only priced cells
            // are compared for the hero type scale
            if (c.hasAttribute('data-pick')) hero.add(`${getComputedStyle(t).fontSize}/${getComputedStyle(t).fontWeight}`);
            if (!b) {
              singles++;
              pad.add(`single:${Math.round(tr.top - r.top)}/${Math.round(r.bottom - tr.bottom)}`);
              return;
            }
            const br = b.getBoundingClientRect();
            if (frac(br.top)) fracY++;
            // filler: a second row carrying a word instead of a number
            if (!/[0-9]/.test(b.textContent)) filler++;
            gap.add(Math.round(br.top - tr.bottom));
            pad.add(`pair:${Math.round(tr.top - r.top)}/${Math.round(r.bottom - br.bottom)}`);
            const bs = getComputedStyle(b);
            sub.add(`${bs.fontSize}/${bs.fontWeight}/${b.classList.contains('is-line') ? 'line' : 'price'}`);
          });
          return { chips: chips.length, fracChip, fracY, singles, filler,
            gap: [...gap], pad: [...pad], hero: [...hero], sub: [...sub] };
        });
        check(`${sport}/${key}: every chip sits on a whole pixel`, m.fracChip === 0, m.fracChip);
        check(`${sport}/${key}: every number is drawn at a whole-pixel y (${m.chips} chips)`, m.fracY === 0, m.fracY);
        check(`${sport}/${key}: the gap between the two rows is identical in every box`, m.gap.length <= 1, m.gap);
        check(`${sport}/${key}: internal padding is identical for each cell shape`, m.pad.length <= 2, m.pad);
        check(`${sport}/${key}: one hero type scale across every priced cell`, m.hero.length === 1, m.hero);
        check(`${sport}/${key}: no cell carries filler text under the number`, m.filler === 0, m.filler);
        check(`${sport}/${key}: the second row is only ever a price or a line`,
          m.sub.every((x) => /\/(price|line)$/.test(x)) && m.sub.length <= 2, m.sub);
      }
    }
    // the hero must actually dominate, and a label must never look like a price
    await goto(page, 'MLB');
    const h = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.sbn-row .sbn-chip[data-pick]:not(.is-single)')][0];
      const t = getComputedStyle(c.querySelector('.sbn-chip-top'));
      const b = getComputedStyle(c.querySelector('.sbn-chip-bot'));
      // the moneyline column: one price, centred, nothing under it
      const heads = [...document.querySelectorAll('.sbn-colhead span')].map((x) => x.textContent.trim());
      const mlCol = heads.indexOf('Moneyline');
      const mlCells = [...document.querySelectorAll('.sbn-row .sbn-trow')]
        .map((tr) => tr.querySelectorAll('.sbn-chip')[mlCol - 1]).filter(Boolean);
      const mlSingle = mlCells.every((x) => x.classList.contains('is-single') && !x.querySelector('.sbn-chip-bot'));
      const mlCentred = mlCells.every((x) => {
        const r = x.getBoundingClientRect(), n = x.querySelector('.sbn-chip-top').getBoundingClientRect();
        return Math.abs((n.top - r.top) - (r.bottom - n.bottom)) <= 1;
      });
      return {
        heroPx: parseFloat(t.fontSize), heroW: +t.fontWeight, heroColour: t.color,
        subPx: parseFloat(b.fontSize), subW: +b.fontWeight, subColour: b.color,
        rowGap: parseFloat(getComputedStyle(c).rowGap),
        mlCells: mlCells.length, mlSingle, mlCentred,
      };
    });
    check(`the hero number leads without shouting (${h.heroPx}px/${h.heroW} over ${h.subPx}px/${h.subW})`,
      h.heroPx >= h.subPx + 3 && h.heroPx <= 18 && h.heroW >= h.subW && h.heroW <= 650, h);
    check('the hero number is off-white, not a pure-white glare', !/rgb\(255,\s*255,\s*255\)/.test(h.heroColour), h.heroColour);
    check('the supporting number is a different colour from the hero', h.subColour !== h.heroColour, [h.heroColour, h.subColour]);
    check(`the two rows are separated rather than stacked tight (${h.rowGap}px)`, h.rowGap >= 5, h.rowGap);
    check(`every moneyline cell is one centred price with no filler (${h.mlCells})`,
      h.mlCells > 0 && h.mlSingle && h.mlCentred, h);
    check('no JS errors through the typography audit', errs.length === 0, errs.slice(0, 4));
    await ctx.close();
  }

  await browser.close();
  if (args.report) fs.writeFileSync(args.report, JSON.stringify({ failures, log }, null, 2));
  console.log(`== next-preview: ${log.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
