#!/usr/bin/env node
/* SPORTSBOOK_NEXT_20260904 post-cutover smoke test.
 * Hits the REAL live /sportsbook/ with NO overlay and NO flag override, exactly
 * as a user arrives, and walks the whole board. POST /api/picks is ALWAYS
 * intercepted, so nothing is ever written to the record.
 *
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/live-smoke.cjs
 */
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
const { resolveCredential } = require('./credential.cjs');
const CRED = resolveCredential(args);
if (!CRED.token) { console.log('SKIP: no member credential.'); process.exit(0); }
console.log(`CREDENTIAL: ${CRED.source}`);
const TOKEN = CRED.token;
const { chromium } = require('playwright');
const PAGE = args.url || 'https://trustmyrecord.com/sportsbook/';
const API = 'https://trustmyrecord-api.onrender.com/api';
let failures = 0; let count = 0;
function check(n, ok, d) {
    count++; if (!ok) failures++;
    let dd = ''; try { dd = JSON.stringify(d).slice(0, 320); } catch (_) {}
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' -> ' + dd}`);
}

async function session(browser, vp) {
    const ctx = await browser.newContext({ viewport: vp });
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
    const errs = [], bad = [], statuses = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 180)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 180)); });
    page.on('response', (r) => {
        if (/trustmyrecord/.test(r.url())) statuses.push(r.status());
        if (r.status() >= 400 && /\/api\//.test(r.url()) && !/avatar/.test(r.url())) bad.push(`${r.status()} ${r.url().slice(0, 100)}`);
    });
    return { ctx, page, posts, errs, bad, statuses, me };
}

(async () => {
    const browser = await chromium.launch({ headless: true });

    // ---- desktop, arriving exactly as a user does ---------------------------
    const { ctx, page, posts, errs, bad, statuses, me } = await session(browser, { width: 1440, height: 1000 });
    const resp = await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    check(`the live page loads (${resp.status()})`, resp.status() === 200, resp.status());
    await page.waitForSelector('.sbn-row', { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const first = await page.evaluate(() => ({
        mounted: !!document.getElementById('sbnShell'),
        flagged: /tmr-sbnext/.test(document.documentElement.className),
        rows: document.querySelectorAll('.sbn-row').length,
        prices: document.querySelectorAll('.sbn-chip[data-pick]').length,
        crests: document.querySelectorAll('img.sbn-crest').length,
        tabs: [...document.querySelectorAll('.sbn-cat')].map((n) => n.getAttribute('data-cat')),
        tally: (document.querySelector('.sbn-tally') || {}).textContent,
        classicHidden: (() => { const l = document.querySelector('.sportsbook-picks-layout'); return !!l && getComputedStyle(l).display === 'none'; })(),
        classicPresent: !!document.querySelector('.sportsbook-picks-layout'),
        heading: !!document.querySelector('h1.make-picks-title'),
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    check('the redesigned board is what a user gets with no override', first.mounted && first.flagged, first);
    check(`real games and prices populate (${first.rows} games, ${first.prices} prices, ${first.tally})`, first.rows > 0 && first.prices > 0, first);
    check(`team crests load (${first.crests})`, first.crests > 0, first.crests);
    check('the classic board is still in the page, hidden, ready to restore', first.classicPresent && first.classicHidden, first);
    check('the page heading and furniture survive', first.heading, first);
    check('no horizontal page overflow', !first.hScroll, first);

    // ---- every market tab ---------------------------------------------------
    for (const key of first.tabs) {
        await page.evaluate((k) => document.querySelector(`.sbn-cat[data-cat="${k}"]`).click(), key);
        await page.waitForTimeout(350);
        const v = await page.evaluate(() => ({
            live: document.querySelectorAll('.sbn-row .sbn-chip[data-pick]').length,
            shapes: [...new Set([...document.querySelectorAll('.sbn-row .sbn-chip')].map((c) => Math.round(c.getBoundingClientRect().height)))],
            frac: [...document.querySelectorAll('.sbn-row .sbn-chip')].filter((c) => Math.abs(c.getBoundingClientRect().top % 1) > 0.01).length,
        }));
        check(`${key}: prices render, one cell height, whole-pixel (${v.live})`,
            v.live > 0 && v.shapes.length === 1 && v.frac === 0, v);
    }

    // ---- pick slip ----------------------------------------------------------
    await page.evaluate(() => document.querySelector('.sbn-cat[data-cat="game_lines"]').click());
    await page.waitForTimeout(400);
    const tap = (i) => page.evaluate((n) => document.querySelectorAll('.sbn-row .sbn-chip[data-pick]')[n].click(), i);
    await tap(0); await page.waitForTimeout(250);
    await tap(5); await page.waitForTimeout(250);
    await tap(10); await page.waitForTimeout(450);
    let s = await page.evaluate(() => ({ n: document.querySelectorAll('.sbn-slip [data-remove]').length, sel: document.querySelectorAll('.sbn-chip.is-sel').length }));
    check(`three picks stack on the slip (${s.n})`, s.n === 3 && s.sel === 3, s);
    await page.evaluate(() => document.querySelector('.sbn-slip [data-remove]').click());
    await page.waitForTimeout(400);
    s = await page.evaluate(() => ({ n: document.querySelectorAll('.sbn-slip [data-remove]').length, sel: document.querySelectorAll('.sbn-chip.is-sel').length }));
    check(`removing a pick clears its board highlight (${s.n})`, s.n === 2 && s.sel === 2, s);
    const units = await page.evaluate(() => {
        const up = document.querySelector('.sbn-slip [data-units][data-dir="1"]');
        if (up) up.click();
        const inp = document.querySelector('.sbn-slip [data-unitsinput]');
        return inp ? inp.value : null;
    });
    check(`the unit control works (${units})`, parseFloat(units) === 1.5, units);
    const mode = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.sbn-slip [data-mode]')].find((x) => x.getAttribute('data-mode') === 'to_win');
        if (b) b.click();
        const on = document.querySelector('.sbn-slip [data-mode].is-on');
        return on ? on.textContent.trim() : null;
    });
    check(`Risk / To win switches (${mode})`, /to win/i.test(mode || ''), mode);

    posts.length = 0;
    await page.evaluate(() => document.getElementById('sbnSubmit').click());
    await page.waitForTimeout(3500);
    check(`locking posts one INTERCEPTED pick per selection (${posts.length})`, posts.length === 2, posts.map((p) => p.market_type));
    check('the payload carries everything the record needs',
        posts.every((p) => p.game_id && p.sport_key && p.market_type && p.selection && p.odds_snapshot != null && p.units && p.stake_mode && p.game_snapshot && p.submission_batch_id),
        posts.map((p) => Object.keys(p).length));
    check('no payload invents a user id: ownership comes from the session',
        posts.every((p) => p.user_id == null && p.userId == null));
    check('the slip empties after the lock', await page.evaluate(() => document.querySelectorAll('.sbn-slip [data-remove]').length) === 0);

    // ---- All Markets --------------------------------------------------------
    await page.evaluate(() => document.querySelector('.sbn-deep').click());
    await page.waitForTimeout(1000);
    const d = await page.evaluate(() => ({
        open: !!document.querySelector('.sbn-drawer-panel'),
        secs: document.querySelectorAll('.sbn-dsec h4').length,
        chips: document.querySelectorAll('.sbn-drawer-panel .sbn-chip[data-pick]').length,
    }));
    check(`All markets opens the full inventory (${d.secs} categories, ${d.chips} prices)`, d.open && d.secs >= 2 && d.chips > 10, d);
    await page.evaluate(() => document.querySelector('.sbn-dclose').click());
    await page.waitForTimeout(400);
    check('All markets closes again', await page.evaluate(() => !document.querySelector('.sbn-drawer-panel')));

    // ---- record integration -------------------------------------------------
    const rec = await fetch(`${API}/picks/user/${me.user.id}?limit=5`, { headers: { Authorization: `Bearer ${TOKEN}` } })
        .then((r) => ({ status: r.status })).catch((e) => ({ status: 0, err: String(e) }));
    check(`the member record endpoint still answers (${rec.status})`, rec.status === 200 || rec.status === 404, rec);

    check('no JS errors on the live page', errs.length === 0, errs.slice(0, 6));
    check('no failing API calls on the live page', bad.length === 0, bad.slice(0, 6));
    check(`no abnormal response codes from the site (${[...new Set(statuses)].join(',')})`,
        statuses.every((c) => c < 400 || c === 401), [...new Set(statuses)]);
    await page.screenshot({ path: args.shot || 'live-sportsbook-desktop.png' });
    await ctx.close();

    // ---- phone --------------------------------------------------------------
    {
        const m = await session(browser, { width: 390, height: 844 });
        await m.page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await m.page.waitForSelector('.sbn-row', { timeout: 90000 }).catch(() => {});
        await m.page.waitForTimeout(3000);
        const v = await m.page.evaluate(() => {
            const rows = [...document.querySelectorAll('.sbn-row')];
            return {
                mounted: !!document.getElementById('sbnShell'),
                rows: rows.length,
                heights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
                hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            };
        });
        check(`mobile: the board renders at 390px (${v.rows} games, card ${v.heights.join('/')})`, v.mounted && v.rows > 0 && v.heights.length === 1, v);
        check('mobile: no horizontal page overflow', !v.hScroll, v);
        await m.page.evaluate(() => document.querySelector('.sbn-row .sbn-chip[data-pick]').click());
        await m.page.waitForTimeout(600);
        const bar = await m.page.evaluate(() => {
            const b = document.getElementById('sbnBar');
            return { on: b.classList.contains('is-on'), text: b.textContent.replace(/\s+/g, ' ').trim() };
        });
        check(`mobile: the slip bar tracks the pick (${bar.text})`, bar.on && /1 pick/.test(bar.text), bar);
        check('mobile: no JS errors', m.errs.length === 0, m.errs.slice(0, 5));
        await m.page.screenshot({ path: args.shotm || 'live-sportsbook-mobile.png' });
        await m.ctx.close();
    }

    // ---- the rollback path still works --------------------------------------
    {
        const r = await session(browser, { width: 1440, height: 1000 });
        await r.page.goto(PAGE + '?sbnext=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await r.page.waitForFunction(() => document.querySelectorAll('#lobbyBoardRows .sb-odds').length > 0, null, { timeout: 60000 }).catch(() => {});
        await r.page.waitForTimeout(1500);
        const v = await r.page.evaluate(() => ({
            mounted: !!document.getElementById('sbnShell'),
            classicPrices: document.querySelectorAll('#lobbyBoardRows .sb-odds').length,
        }));
        check(`rollback: ?sbnext=0 restores the classic board immediately (${v.classicPrices} prices)`,
            !v.mounted && v.classicPrices > 0, v);
        check('rollback: no JS errors on the classic board', r.errs.length === 0, r.errs.slice(0, 5));
        await r.ctx.close();
    }

    await browser.close();
    console.log(`== live-smoke: ${count - failures} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
})();
