#!/usr/bin/env node
/**
 * FIRST_3_7_INNINGS_20261006 (Nima): FanDuel First 3 / First 7 innings on the
 * V3 board. The fixture is exactly what the backend's services/fanduelInnings.js
 * builds from a real FanDuel payload. Boots the shipped renderer against a
 * stubbed DOM (same harness as sportsbook-soccer-draw-row-test.js) and checks:
 *   - First 3 and First 7 are their own tabs, never mixed with Game Lines/First 5
 *   - columns read Run Line / Total / Result, the three way Tie has its own row
 *   - every chip carries the exact market type, the FanDuel book and a slip
 *     label that says First 3 Innings / First 7 Innings
 *   - an F5 or full game price filed under the F3 group never reaches it
 *   - the expanded panel lists the Tie with the clubs, result first
 *   - stored F3 / F7 picks read correctly on record surfaces
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'sportsbook-next.js'), 'utf8');
const fixture = require('./fixtures/board-mlb-first-3-7-innings-groups.json');

function boot(game, sportKey, sportParam) {
    const boardRe = new RegExp('games/board/' + sportKey);
    let html = '';
    const stub = () => ({
        className: '', style: {}, dataset: {}, textContent: '', innerHTML: '', parentNode: null,
        appendChild() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
        addEventListener() {}, querySelector() { return stub(); }, querySelectorAll() { return []; },
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        closest() { return null; }, focus() {}, scrollIntoView() {},
    });
    const boardNode = stub();
    Object.defineProperty(boardNode, 'innerHTML', { get() { return html; }, set(v) { html = v; } });
    const settled = (value) => ({
        then(fn) { const out = fn ? fn(value) : value; return (out && out.then) ? out : settled(out); },
        catch() { return this; },
    });
    const ctx = {
        console, JSON, Math, Date, Number, String, Object, Array, URLSearchParams, RegExp, isNaN, parseInt, parseFloat,
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        document: {
            readyState: 'complete',
            getElementById: (id) => (id === 'sbnBoard' ? boardNode : null),
            querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
            createElement: () => stub(),
            documentElement: { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
            body: stub(),
        },
        location: { search: '?sport=' + sportParam, pathname: '/sportsbook/next/' },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        fetch: (url) => settled({
            ok: boardRe.test(String(url)),
            json: () => settled(boardRe.test(String(url)) ? { games: [game] } : { games: [] }),
        }),
    };
    ctx.window = ctx;
    ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: 'sportsbook-next.js' });
    const api = ctx.window.__sbNext;
    assert(api && api.state.games.length === 1, 'the fixture game must reach the board');
    return { api, html: () => html };
}
function picksIn(fragment) {
    return (fragment.match(/data-pick="([^"]*)"/g) || []).map((m) => JSON.parse(
        m.slice(11, -1).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')));
}


const AWAY = 'Milwaukee Brewers';
const HOME = 'San Diego Padres';
const groups = JSON.parse(JSON.stringify(fixture.groups));
// Wrong period protection: an F5 and a full game price filed under first_3.
groups[0].items.push({ market_type: 'f5_totals', selection: 'Over', line: 4.5, odds: -110, book_title: 'FanDuel', source: 'sportsbook' });
groups[0].items.push({ market_type: 'totals', selection: 'Over', line: 7.5, odds: -110, book_title: 'FanDuel', source: 'sportsbook' });
const GAME = {
    id: 'an_baseball_mlb_303119', sport_key: 'baseball_mlb', away_team: AWAY, home_team: HOME,
    commence_time: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    bookmakers: [{ key: 'draftkings', title: 'DraftKings', markets: [
        { key: 'h2h', outcomes: [{ name: AWAY, price: 114 }, { name: HOME, price: -135 }] },
        { key: 'totals', outcomes: [{ name: 'Over', point: 7, price: -118 }, { name: 'Under', point: 7, price: -103 }] },
    ] }],
    market_groups: groups,
};

const b = boot(GAME, 'baseball_mlb', 'MLB');
const cats = b.api.state.games[0].groups;
assert.ok(cats.first_3 && cats.first_7, 'both groups reach the board');
assert.ok(cats.first_3.items.every((i) => /^f3_/.test(i.marketType)), 'only F3 market types under First 3');
assert.strictEqual(cats.first_3.items.length, 7, 'the stray F5 and full game prices were dropped');

function tab(key) {
    b.api.state.cat = key;
    b.api.state.drawer = null;
    b.api.render();
    return b.html();
}
const f3 = tab('first_3');
assert.ok(/<span>Run Line<\/span><span>Total<\/span><span>Result<\/span>/.test(f3), 'columns read Run Line / Total / Result');
const rows = f3.split('<div class="sbn-trow').slice(1);
assert.strictEqual(rows.length, 3, 'away, home and Tie');
assert.ok(/<b>Tie<\/b>/.test(rows[2]), 'third row is the Tie');
const picks = picksIn(f3);
assert.strictEqual(picks.length, 7, 'seven F3 prices');
picks.forEach((p) => {
    assert.ok(/^f3_(h2h|spreads|totals)$/.test(p.marketType), p.marketType);
    assert.strictEqual(p.book, 'FanDuel', 'priced at FanDuel');
    assert.strictEqual(p.groupLabel, 'First 3 Innings');
    assert.ok(/First 3 Innings/.test(p.label), 'slip label says First 3 Innings: ' + p.label);
});
const tie = picks.find((p) => p.selection === 'Tie');
assert.deepStrictEqual([tie.marketType, tie.label, tie.line, tie.odds], ['f3_h2h', 'First 3 Innings Result: Tie', null, 245]);
const homeRl = picks.find((p) => p.marketType === 'f3_spreads' && p.selection === HOME);
assert.deepStrictEqual([homeRl.line, homeRl.odds, homeRl.label], [-0.5, 130, 'First 3 Innings Run Line: San Diego Padres -0.5']);
const over = picks.find((p) => p.marketType === 'f3_totals' && p.selection === 'Over');
assert.deepStrictEqual([over.line, over.odds], [2.5, 112]);

const f7 = tab('first_7');
const p7 = picksIn(f7);
assert.strictEqual(p7.length, 7);
assert.ok(p7.every((p) => /^f7_/.test(p.marketType) && /First 7 Innings/.test(p.label) && p.book === 'FanDuel'));

// Game Lines never shows an F3 / F7 price.
const gl = tab('game_lines');
assert.ok(!picksIn(gl.split('<section class="sbn-dsec')[0]).some((p) => /^f[37]_/.test(p.marketType)), 'no F3/F7 chip on Game Lines');

// Expanded F3 panel: result first on every row, Tie with the clubs.
b.api.state.cat = 'first_3';
b.api.state.drawer = GAME.id;
b.api.state.drawerCat = 'first_3';
b.api.render();
const sec = b.html().split('<section class="sbn-dsec')[1];
const sides = (sec.match(/<span class="sbn-dside">([^<]*)<\/span>/g) || []).map((s) => s.replace(/<[^>]+>/g, ''));
assert.deepStrictEqual(sides, [AWAY, HOME, 'Tie', 'Over', 'Under']);
assert.ok(!/sbn-chip-top">ML</.test(sec), 'a three way result never reads ML');
assert.ok(/sbn-chip-top">Result</.test(sec), 'it reads Result');
sec.split('<div class="sbn-drow">').slice(1, 3).forEach((row) => {
    assert.strictEqual(picksIn(row)[0].marketType, 'f3_h2h', 'the result leads each club row');
});

// Record surfaces.
global.window = {};
require('../static/js/tmr-market-labels.js');
require('../static/js/pick-display-format.js');
const fmt = global.window.TMR.formatPickDisplay;
const t1 = fmt({ market_type: 'f3_h2h', selection: 'Tie', sport_key: 'baseball_mlb' });
assert.deepStrictEqual([t1.pickLabel, t1.marketLabel, t1.wagerCategory], ['F3 Tie', 'First 3 Innings Result', 'MLB — First 3 Innings Result']);
const t2 = fmt({ market_type: 'f7_spreads', selection: HOME, line_snapshot: -0.5, sport_key: 'baseball_mlb' });
assert.deepStrictEqual([t2.pickLabel, t2.marketLabel, t2.segment], ['F7 San Diego Padres -0.5', 'First 7 Innings Run Line', 'first_seven']);
const t3 = fmt({ market_type: 'f3_totals', selection: 'Under', line_snapshot: 2.5, sport_key: 'baseball_mlb' });
assert.deepStrictEqual([t3.pickLabel, t3.marketLabel], ['F3 Under 2.5', 'First 3 Innings Total']);
const t5 = fmt({ market_type: 'f5_h2h', selection: HOME, sport_key: 'baseball_mlb' });
assert.strictEqual(t5.pickLabel, 'F5 San Diego Padres ML', 'First 5 is unchanged');

console.log('sportsbook first 3 / first 7 innings test passed');
