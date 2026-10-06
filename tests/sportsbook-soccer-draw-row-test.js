#!/usr/bin/env node
/**
 * SOCCER_DRAW_ROW_20261006. A soccer moneyline is three way. The board drew one
 * row per club, so the Draw price was reachable only inside All markets, and
 * inside All markets the cells were sorted by line with the moneyline read as
 * line 0: the club taking +0.5 showed ML first, the club laying -0.5 showed its
 * handicap first, and the Draw row sat under Over and Under.
 *
 * Boots the shipped renderer against a stubbed DOM (same harness as
 * sportsbook-alt-team-totals-lock-test.js) and checks:
 *   - the main row has a Draw row with the Draw price in the Moneyline column
 *   - the Draw chip carries the same pick data the drawer's Draw chip carries
 *   - a two way sport gets no Draw row
 *   - All markets reads away, home, Draw, Over, Under, every row ML first
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'sportsbook-next.js'), 'utf8');

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

const AWAY = 'Vancouver Whitecaps';
const HOME = 'Chicago Fire';
const SOCCER = {
    id: 'an_soccer_1', sport_key: 'soccer', away_team: AWAY, home_team: HOME,
    commence_time: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    bookmakers: [{ key: 'draftkings', title: 'DraftKings', markets: [
        { key: 'spreads', outcomes: [{ name: HOME, point: 0.5, price: -165 }, { name: AWAY, point: -0.5, price: 115 }] },
        { key: 'totals', outcomes: [{ name: 'Over', point: 3.5, price: 110 }, { name: 'Under', point: 3.5, price: -145 }] },
        { key: 'h2h', outcomes: [{ name: HOME, price: 240 }, { name: 'Draw', price: 305 }, { name: AWAY, price: -115 }] },
    ] }],
    market_groups: [],
};

const soccer = boot(SOCCER, 'soccer', 'Soccer');
soccer.api.render();
const board = soccer.html();
const rows = board.split('<div class="sbn-trow').slice(1);
assert.strictEqual(rows.length, 3, 'two clubs and a Draw row');
assert(/^ sbn-trow--draw/.test(rows[2]) && /<b>Draw<\/b>/.test(rows[2]), 'the third row is the Draw');
const drawPicks = picksIn(rows[2]);
assert.strictEqual(drawPicks.length, 1, 'the Draw row has exactly one priced chip');
assert.deepStrictEqual(
    { mt: drawPicks[0].marketType, sel: drawPicks[0].selection, label: drawPicks[0].label, line: drawPicks[0].line, odds: drawPicks[0].odds },
    { mt: 'h2h', sel: 'Draw', label: 'Draw ML', line: null, odds: 305 },
    'the Draw chip carries the drawer Draw chip data');
assert(/sbn-drawgap[\s\S]*sbn-drawgap[\s\S]*data-pick/.test(rows[2]), 'handicap and total columns are empty, the price sits in the Moneyline column');
assert(!/sbn-crest|sbn-chip is-off/.test(rows[2].replace(/<span class="sbn-crest" aria-hidden="true"><\/span>/, '')), 'no disabled chips and no Draw crest');

// All markets: away, home, Draw, Over, Under, and every row ML first.
soccer.api.state.drawer = SOCCER.id;
soccer.api.render();
const sec = soccer.html().split('<section class="sbn-dsec')[1];
const sides = (sec.match(/<span class="sbn-dside">([^<]*)<\/span>/g) || []).map((s) => s.replace(/<[^>]+>/g, ''));
assert.deepStrictEqual(sides, [AWAY, HOME, 'Draw', 'Over', 'Under'], 'drawer rows read like the board');
const drows = sec.split('<div class="sbn-drow">').slice(1);
[0, 1, 2].forEach((i) => {
    const first = picksIn(drows[i])[0];
    assert.strictEqual(first.marketType, 'h2h', sides[i] + ' leads with its moneyline');
});
assert.strictEqual(picksIn(drows[2])[0].label, 'Draw ML');

// A two way sport never grows a Draw row.
const MLB = {
    id: 'an_mlb_1', sport_key: 'baseball_mlb', away_team: 'Los Angeles Dodgers', home_team: 'Atlanta Braves',
    commence_time: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    bookmakers: [{ key: 'draftkings', title: 'DraftKings', markets: [
        { key: 'h2h', outcomes: [{ name: 'Los Angeles Dodgers', price: -109 }, { name: 'Atlanta Braves', price: -110 }] },
    ] }],
    market_groups: [],
};
const mlb = boot(MLB, 'baseball_mlb', 'MLB');
mlb.api.render();
assert(!/sbn-trow--draw/.test(mlb.html()), 'no Draw row on a two way moneyline');

console.log('sportsbook soccer draw row test passed');
