#!/usr/bin/env node
/* SPORTSBOOK_NEXT_EMBED_20260904 verification.
 * Loads the REAL /sportsbook/ page and checks the flagged mount: that the flag
 * off leaves the classic board alone, that the flag on swaps the board region
 * without disturbing the site chrome, and that the whole pick flow works there.
 * POST /api/picks is ALWAYS intercepted, so nothing is ever recorded.
 *
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/embed-check.cjs [--url <page>]
 *   SBV2_OVERLAY_CLASSIC=1 serves the working-tree page instead of the deployed one.
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
let failures = 0; const log = []; let CHROME = null;
function check(n, ok, d) {
    if (!ok) failures++;
    log.push({ n, ok });
    let dd = ''; try { dd = JSON.stringify(d).slice(0, 300); } catch (_) {}
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' -> ' + dd}`);
}

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
    // Non-negotiable: every browser tool that can press Lock installs this.
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
    return { ctx, page, posts, errs, bad };
}
async function goto(page, qs) {
    await page.goto(PAGE + (qs || ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1000);
}

(async () => {
    const browser = await chromium.launch({ headless: true });

    // ---- 1. flag OFF: the classic board is exactly what it was --------------
    {
        const { ctx, page, errs } = await open(browser, { width: 1440, height: 1000 });
        await goto(page, '?sbnext=0');
        // the classic board picks its own opening sport and fetches it, so wait
        // for prices rather than for a fixed number of seconds
        await page.waitForFunction(() => document.querySelectorAll('#lobbyBoardRows .sb-odds').length > 0,
            null, { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const s = await page.evaluate(() => ({
            mounted: !!document.getElementById('sbnShell'),
            htmlClass: document.documentElement.className,
            classicVisible: !!document.querySelector('.sportsbook-picks-layout') &&
                getComputedStyle(document.querySelector('.sportsbook-picks-layout')).display !== 'none',
            classicPrices: document.querySelectorAll('#lobbyBoardRows .sb-odds').length,
            // fingerprint of the page furniture, compared against the flag-on run
            chrome: {
                headers: document.querySelectorAll('header').length,
                heading: !!document.querySelector('h1.make-picks-title'),
                links: document.querySelectorAll('a[href^="/"]').length > 10,
                bodyFont: getComputedStyle(document.body).fontSize + '/' + getComputedStyle(document.body).color,
            },
        }));
        CHROME = s.chrome;
        check('flag off: the new board does not mount', !s.mounted, s);
        check('flag off: no tmr-sbnext class is applied', !/tmr-sbnext/.test(s.htmlClass), s.htmlClass);
        check('flag off: the classic board is visible', s.classicVisible, s);
        check(`flag off: the classic board still prices games (${s.classicPrices})`, s.classicPrices > 0, s.classicPrices);
        check('flag off: no JS errors', errs.length === 0, errs.slice(0, 4));
        await ctx.close();
    }

    // ---- 2. flag ON: the board region swaps, the page does not --------------
    {
        const { ctx, page, posts, errs, bad } = await open(browser, { width: 1440, height: 1000 });
        await goto(page, '?sbnext=1');
        await page.waitForSelector('.sbn-row', { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(2500);
        const s = await page.evaluate(() => {
            const rows = [...document.querySelectorAll('.sbn-row')];
            const layout = document.querySelector('.sportsbook-picks-layout');
            return {
                mounted: !!document.getElementById('sbnShell'),
                rows: rows.length,
                chips: document.querySelectorAll('.sbn-chip[data-pick]').length,
                tabs: [...document.querySelectorAll('.sbn-cat')].map((n) => n.getAttribute('data-cat')),
                classicHidden: !!layout && getComputedStyle(layout).display === 'none',
                classicStillInDom: !!layout,
                siteHeaderVisible: !!document.querySelector('h1.make-picks-title'),
                chrome: {
                    headers: document.querySelectorAll('header').length,
                    heading: !!document.querySelector('h1.make-picks-title'),
                    links: document.querySelectorAll('a[href^="/"]').length > 10,
                    bodyFont: getComputedStyle(document.body).fontSize + '/' + getComputedStyle(document.body).color,
                },
                hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                crests: document.querySelectorAll('img.sbn-crest').length,
                bodyFont: getComputedStyle(document.body).fontFamily.split(',')[0],
            };
        });
        check(`flag on: the new board mounts and prices games (${s.rows} games, ${s.chips} prices)`, s.mounted && s.rows > 0 && s.chips > 0, s);
        check('flag on: the classic board is hidden but still in the page', s.classicHidden && s.classicStillInDom, s);
        check('flag on: the page furniture is byte-for-byte what the classic page shows',
            JSON.stringify(s.chrome) === JSON.stringify(CHROME), { on: s.chrome, off: CHROME });
        check('flag on: the page heading survives', s.siteHeaderVisible, s);
        check('flag on: no horizontal page overflow', !s.hScroll, s);
        check(`flag on: team crests render (${s.crests})`, s.crests > 0, s.crests);
        check(`flag on: the stylesheet leaves the page body type alone (${s.chrome.bodyFont})`,
            s.chrome.bodyFont === CHROME.bodyFont, { on: s.chrome.bodyFont, off: CHROME.bodyFont });

        // every market tab
        for (const key of s.tabs) {
            await page.evaluate((k) => document.querySelector(`.sbn-cat[data-cat="${k}"]`).click(), key);
            await page.waitForTimeout(300);
            const v = await page.evaluate(() => ({
                live: document.querySelectorAll('.sbn-row .sbn-chip[data-pick]').length,
                shapes: [...new Set([...document.querySelectorAll('.sbn-row .sbn-chip')].map((c) => Math.round(c.getBoundingClientRect().height)))],
            }));
            check(`flag on: ${key} renders priced chips (${v.live})`, v.live > 0 && v.shapes.length === 1, v);
        }

        // pick flow
        await page.evaluate(() => document.querySelector('.sbn-cat[data-cat="game_lines"]').click());
        await page.waitForTimeout(400);
        const tap = async (n) => page.evaluate((i) => document.querySelectorAll('.sbn-row .sbn-chip[data-pick]')[i].click(), n);
        await tap(0); await page.waitForTimeout(250);
        await tap(4); await page.waitForTimeout(250);
        await tap(8); await page.waitForTimeout(400);
        let slip = await page.evaluate(() => ({
            n: document.querySelectorAll('.sbn-slipitem, .sbn-slip [data-remove]').length,
            sel: document.querySelectorAll('.sbn-chip.is-sel').length,
        }));
        check(`flag on: three taps build a three-pick slip (${slip.n})`, slip.n === 3 && slip.sel === 3, slip);
        await page.evaluate(() => document.querySelector('.sbn-slip [data-remove]').click());
        await page.waitForTimeout(350);
        slip = await page.evaluate(() => ({ n: document.querySelectorAll('.sbn-slip [data-remove]').length, sel: document.querySelectorAll('.sbn-chip.is-sel').length }));
        check(`flag on: removing a pick clears its board highlight (${slip.n})`, slip.n === 2 && slip.sel === 2, slip);
        const units = await page.evaluate(() => {
            const up = document.querySelector('.sbn-slip [data-units][data-dir="1"]');
            if (up) up.click();
            const inp = document.querySelector('.sbn-slip [data-unitsinput]');
            return inp ? inp.value : null;
        });
        check(`flag on: the units stepper works (${units})`, parseFloat(units) === 1.5, units);
        const mode = await page.evaluate(() => {
            const b = [...document.querySelectorAll('.sbn-slip [data-mode]')].find((x) => x.getAttribute('data-mode') === 'to_win');
            if (b) b.click();
            const on = document.querySelector('.sbn-slip [data-mode].is-on');
            return on ? on.textContent.trim() : null;
        });
        check(`flag on: Risk / To win switches (${mode})`, /to win/i.test(mode || ''), mode);

        posts.length = 0;
        await page.evaluate(() => document.getElementById('sbnSubmit').click());
        await page.waitForTimeout(3000);
        check(`flag on: locking posts one intercepted pick per selection (${posts.length})`, posts.length === 2, posts.map((p) => p.market_type));
        check('flag on: the payload carries what the record needs',
            posts.every((p) => p.game_id && p.sport_key && p.market_type && p.selection && p.odds_snapshot != null && p.units && p.submission_batch_id),
            posts.map((p) => Object.keys(p).length));
        check('flag on: no pick payload invents a user id', posts.every((p) => p.user_id == null && p.userId == null));
        const cleared = await page.evaluate(() => document.querySelectorAll('.sbn-slip [data-remove]').length);
        check('flag on: the slip empties after a lock', cleared === 0, cleared);

        // drawer
        await page.evaluate(() => document.querySelector('.sbn-deep').click());
        await page.waitForTimeout(900);
        const d = await page.evaluate(() => ({
            open: !!document.querySelector('.sbn-drawer-panel'),
            secs: document.querySelectorAll('.sbn-dsec h4').length,
            chips: document.querySelectorAll('.sbn-drawer-panel .sbn-chip[data-pick]').length,
        }));
        check(`flag on: All markets opens the full inventory (${d.secs} categories, ${d.chips} prices)`, d.open && d.secs >= 2 && d.chips > 10, d);
        await page.evaluate(() => document.querySelector('.sbn-dclose').click());
        await page.waitForTimeout(400);
        check('flag on: the drawer closes', await page.evaluate(() => !document.querySelector('.sbn-drawer-panel')));

        check('flag on: no JS errors on the live page', errs.length === 0, errs.slice(0, 5));
        check('flag on: no failing API calls', bad.length === 0, bad.slice(0, 5));
        await ctx.close();
    }

    // ---- 3. flag ON at phone width ------------------------------------------
    {
        const { ctx, page, errs } = await open(browser, { width: 390, height: 844 });
        await goto(page, '?sbnext=1');
        await page.waitForSelector('.sbn-row', { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(2500);
        const m = await page.evaluate(() => {
            const rows = [...document.querySelectorAll('.sbn-row')];
            return {
                rows: rows.length,
                heights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
                hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                barVisible: !!document.getElementById('sbnBar') && getComputedStyle(document.getElementById('sbnBar')).display !== 'none',
            };
        });
        check(`mobile: the board renders at 390px (${m.rows} games, card ${m.heights.join('/')})`, m.rows > 0 && m.heights.length === 1, m);
        check('mobile: no horizontal page overflow', !m.hScroll, m);
        await page.evaluate(() => document.querySelector('.sbn-row .sbn-chip[data-pick]').click());
        await page.waitForTimeout(500);
        const bar = await page.evaluate(() => {
            const b = document.getElementById('sbnBar');
            return { on: b.classList.contains('is-on'), text: b.textContent.replace(/\s+/g, ' ').trim() };
        });
        check(`mobile: the slip bar shows the running count (${bar.text})`, bar.on && /1 pick/.test(bar.text), bar);
        check('mobile: no JS errors', errs.length === 0, errs.slice(0, 4));
        await ctx.close();
    }

    await browser.close();
    console.log(`== embed-check: ${log.length - failures} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
})();
