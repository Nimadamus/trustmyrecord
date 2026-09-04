#!/usr/bin/env node
/* SPORTSBOOK_NEXT_20260904 market inventory audit.
 *
 * Proves no wager type was lost in the redesign. For every sport that has a
 * board, it reads the market groups straight from the feed, then checks the
 * rendered page offers each one: a tab exists, clicking it prices real chips,
 * the quote cell lays out selection-left / price-right, a click puts the right
 * selection on the slip, the posted payload keeps that market's own type, and
 * the deeper inventory is still reachable through All markets.
 *
 * POST /api/picks is ALWAYS intercepted, so nothing is ever recorded.
 *
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/market-inventory.cjs [--url <page>]
 */
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
const { resolveCredential } = require('./credential.cjs');
const CRED = resolveCredential(args);
if (!CRED.token) { console.log('SKIP: no member credential.'); process.exit(0); }
console.log(`CREDENTIAL: ${CRED.source}`);
const TOKEN = CRED.token;
const { chromium } = require('playwright');
const { installOverlay } = require('./overlay.cjs');
const PAGE = args.url || 'https://trustmyrecord.com/sportsbook/';
const API = 'https://trustmyrecord-api.onrender.com/api';
const SPORTS = [
    ['MLB', 'baseball_mlb'], ['NFL', 'americanfootball_nfl'], ['NCAAF', 'americanfootball_ncaaf'],
    ['NBA', 'basketball_nba'], ['NCAAB', 'basketball_ncaab'], ['WNBA', 'basketball_wnba'],
    ['NHL', 'icehockey_nhl'], ['NPB', 'baseball_npb'], ['Soccer', 'soccer'], ['UFC', 'mma_ufc'],
];
const LINE_GROUPS = { full_game: 1, spread: 1, total: 1 };
let failures = 0, count = 0;
function check(n, ok, d) {
    count++; if (!ok) failures++;
    let dd = ''; try { dd = JSON.stringify(d).slice(0, 300); } catch (_) {}
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' -> ' + dd}`);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
    const errs = []; const bad = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 160)); });
    page.on('response', (r) => { if (r.status() >= 400 && /\/api\//.test(r.url()) && !/avatar/.test(r.url())) bad.push(`${r.status()} ${r.url().slice(0, 90)}`); });

    for (const [key, apiKey] of SPORTS) {
        // what the feed actually offers for this sport
        let games = [];
        try {
            const d = await (await fetch(`${API}/games/board/${apiKey}?limit=60`)).json();
            games = (d && d.games) || [];
        } catch (_) {}
        if (!games.length) { console.log(`SKIP  ${key}: no board posted right now`); continue; }
        // A group counts as inventory only if something in it is actually priced.
        // The feed emits market shells with null odds and null lines: 62 of 80
        // NCAAF games carry a Second Half group where every item is priceless.
        // There is nothing to bet there, the board is right to drop it, and a
        // tab for it would be a tab onto an empty market.
        const priced = (grp) => (grp.items || []).some((i) => i && i.odds !== null && i.odds !== undefined);
        const feedCats = new Set();
        games.forEach((g) => {
            if ((g.bookmakers || []).length) feedCats.add('game_lines');
            (g.market_groups || []).forEach((grp) => {
                if (!grp || !grp.key || !priced(grp)) return;
                feedCats.add(LINE_GROUPS[grp.key] ? 'game_lines' : grp.key);
            });
        });

        await page.goto(`${PAGE}?sport=${key}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForSelector('.sbn-row', { timeout: 90000 }).catch(() => {});
        // The tab bar is built from whatever games have resolved so far, so any
        // fixed sleep, and even a short stability window, can sample it mid-render
        // and under-report a market. Wait for the expected set instead: if a market
        // really is missing this still times out and the check below fails, which
        // is the outcome we want. It just stops failing for a market that was on
        // its way in.
        await page.waitForFunction((want) => {
            const have = [...document.querySelectorAll('.sbn-cat')].map((n) => n.getAttribute('data-cat'));
            return have.length > 0 && want.every((w) => have.includes(w));
        }, [...feedCats], { timeout: 45000, polling: 250 }).catch(() => {});
        await page.waitForTimeout(500);
        const tabs = await page.$$eval('.sbn-cat', (ns) => ns.map((n) => n.getAttribute('data-cat')));
        const missing = [...feedCats].filter((c) => !tabs.includes(c));
        check(`${key}: every market group in the feed has a tab (${tabs.length} tabs, ${feedCats.size} groups)`,
            missing.length === 0, { missing, tabs, feed: [...feedCats] });
        check(`${key}: no tab offers a market the feed did not return`,
            tabs.every((t) => feedCats.has(t)), tabs.filter((t) => !feedCats.has(t)));

        for (const cat of tabs) {
            await page.evaluate((c) => document.querySelector(`.sbn-cat[data-cat="${c}"]`).click(), cat);
            await page.waitForTimeout(400);
            const v = await page.evaluate(() => {
                const chips = [...document.querySelectorAll('.sbn-row .sbn-chip[data-pick]')];
                let misaligned = 0, clipped = 0;
                chips.forEach((c) => {
                    const r = c.getBoundingClientRect();
                    const t = c.querySelector('.sbn-chip-top'), b = c.querySelector('.sbn-chip-bot');
                    const cs = getComputedStyle(c);
                    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
                    [t, b].filter(Boolean).forEach((e) => { if (e.scrollWidth > e.clientWidth + 1) clipped++; });
                    if (cs.flexDirection !== 'row') misaligned++;
                    if (b) {
                        const tr = t.getBoundingClientRect(), br = b.getBoundingClientRect();
                        const lead = tr.left <= br.left ? tr : br, tail = lead === tr ? br : tr;
                        if (Math.abs(lead.left - (r.left + padL)) > 3) misaligned++;
                        if (Math.abs(r.right - padR - tail.right) > 3) misaligned++;
                    }
                });
                const first = chips[0] ? JSON.parse(chips[0].getAttribute('data-pick')) : null;
                return { priced: chips.length, misaligned, clipped, first };
            });
            check(`${key}/${cat}: prices render (${v.priced})`, v.priced > 0, v);
            check(`${key}/${cat}: selection left, price right, nothing clipped`,
                v.misaligned === 0 && v.clipped === 0, { misaligned: v.misaligned, clipped: v.clipped });

            // one real pick from this category, intercepted
            posts.length = 0;
            const tapped = await page.evaluate(() => {
                const c = document.querySelector('.sbn-row .sbn-chip[data-pick]');
                if (!c) return null;
                const d = JSON.parse(c.getAttribute('data-pick'));
                c.click();
                return d;
            });
            await page.waitForTimeout(400);
            const onSlip = await page.evaluate(() => {
                const row = document.querySelector('.sbn-slip .sbn-slipsel');
                return row ? row.textContent.trim() : null;
            });
            check(`${key}/${cat}: tapping a price puts that selection on the slip`,
                !!(tapped && onSlip && onSlip.length), { tapped: tapped && tapped.label, onSlip });
            await page.evaluate(() => document.getElementById('sbnSubmit').click());
            await page.waitForTimeout(2200);
            check(`${key}/${cat}: the posted payload keeps this market's own type (${posts[0] && posts[0].market_type})`,
                !!tapped && posts.length === 1 && posts[0].market_type === tapped.marketType &&
                posts[0].odds_snapshot === tapped.odds &&
                (tapped.line == null ? posts[0].line_snapshot == null : posts[0].line_snapshot === tapped.line),
                { posted: posts[0] && [posts[0].market_type, posts[0].line_snapshot, posts[0].odds_snapshot],
                  tapped: tapped && [tapped.marketType, tapped.line, tapped.odds] });
        }

        // deeper inventory still reachable
        await page.evaluate(() => document.querySelector('.sbn-cat').click());
        await page.waitForTimeout(400);
        await page.evaluate(() => { const d = document.querySelector('.sbn-deep'); if (d) d.click(); });
        await page.waitForTimeout(900);
        const drawer = await page.evaluate(() => ({
            open: !!document.querySelector('.sbn-drawer-panel'),
            secs: [...document.querySelectorAll('.sbn-dsec h4')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
            chips: document.querySelectorAll('.sbn-drawer-panel .sbn-chip[data-pick]').length,
        }));
        check(`${key}: All markets still reaches the deeper inventory (${drawer.secs.length} sections, ${drawer.chips} prices)`,
            drawer.open && drawer.secs.length >= 1 && drawer.chips > 0, drawer.secs.slice(0, 8));
        await page.evaluate(() => { const c = document.querySelector('.sbn-dclose'); if (c) c.click(); });
        await page.waitForTimeout(300);
    }

    check('no JS errors across the whole inventory audit', errs.length === 0, errs.slice(0, 6));
    check('no failing API calls across the whole inventory audit', bad.length === 0, bad.slice(0, 6));
    await ctx.close();
    await browser.close();
    console.log(`== market-inventory: ${count - failures} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
})();
