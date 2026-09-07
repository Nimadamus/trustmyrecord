#!/usr/bin/env node
/**
 * ALT_TEAM_TOTALS_20260906 (Nima): the Team Totals tab on the V2/V3 board must
 * post EVERY team-total rung the feed carries, grouped by club and sorted low
 * to high, instead of the first Over and the first Under it happens to find.
 *
 * The board engine is booted here against a stubbed DOM and a stubbed board
 * feed, so these assertions run the shipped renderer rather than a copy of it.
 * The fixture is shaped exactly like /api/games/board/baseball_mlb on a real
 * day: the main number priced at one book, the alternate ladder at another,
 * one rung both books price, one rung priced on a single side, and one
 * sub-2.5 MLB rung that the standing integrity rule must keep off the board.
 *
 * The live-data companion is tests/sportsbook-team-totals-browser-proof.js.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-next.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'static', 'css', 'sportsbook-next.css'), 'utf8');

// ---- source locks -----------------------------------------------------------
assert(/function isTeamTotalKey/.test(src), 'team-total groups need their own identifier');
assert(/isTeamTotalKey\(key\)\) return mergeLadder\(items\)/.test(src),
    'a team-total group must merge rungs across books; keeping one book drops the main line');
assert(/isTeamTotalKey\(key\)\) return 'ttgrid'/.test(src),
    'team totals must render as the per-club grid, not the two-chip Over/Under row');
assert(/function ttLadder/.test(src) && /function ttGrid/.test(src), 'the ttgrid renderer must exist');
assert(!/key === 'team_totals'\) return 'ou'/.test(src), 'the collapsed single-line layout must not come back');
assert(/\.sbn-ttteam/.test(css) && /\.sbn-ttrow/.test(css), 'the ttgrid needs its own styles');
assert(/max-width: 560px\)[\s\S]{0,600}\.sbn-ttrow/.test(css), 'the ttgrid needs a narrow-screen column set');

// ---- the feed fixture -------------------------------------------------------
const AWAY = 'Boston Red Sox';
const HOME = 'Baltimore Orioles';
function rung(book, team, side, line, odds, isMain) {
    const item = {
        selection: team + ' ' + side,
        selection_label: team + ' ' + side + ' +' + line,
        line: line, odds: odds, book_title: book,
        market_type: 'team_totals', market_key: 'team_totals', group_key: 'team_totals',
        source: 'sportsbook',
    };
    // ALT_TEAM_TOTALS_COVERAGE_20260907: the backend names the rung the book
    // leads with, so the renderer no longer has to guess it from feed order.
    if (isMain) item.is_main_line = true;
    return item;
}
const GAME = {
    id: 'fixture_1', sport_key: 'baseball_mlb', away_team: AWAY, home_team: HOME,
    commence_time: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    bookmakers: [{
        key: 'draftkings', title: 'DraftKings', markets: [
            { key: 'h2h', outcomes: [{ name: AWAY, price: -135 }, { name: HOME, price: 113 }] },
        ],
    }],
    market_groups: [{
        key: 'team_totals', label: 'Team Totals', items: [
            rung('DraftKings', AWAY, 'Over', 3.5, -130, true), rung('DraftKings', AWAY, 'Under', 3.5, -102, true),
            rung('DraftKings', HOME, 'Over', 3.5, 110, true), rung('DraftKings', HOME, 'Under', 3.5, -150, true),
            rung('FanDuel', AWAY, 'Over', 2.5, -245), rung('FanDuel', AWAY, 'Under', 2.5, 186),
            rung('FanDuel', AWAY, 'Over', 3.5, -128),
            rung('FanDuel', AWAY, 'Over', 4.5, 140), rung('FanDuel', AWAY, 'Under', 4.5, -180),
            rung('FanDuel', AWAY, 'Over', 11.5, 2200),
            rung('FanDuel', AWAY, 'Over', 1.5, -900),
            rung('FanDuel', HOME, 'Over', 4.5, 230), rung('FanDuel', HOME, 'Under', 4.5, -310),
        ],
    }],
};

const board = renderTeamTotals(GAME);
const blocks = board.split('<div class="sbn-ttteam">').slice(1);
assert.strictEqual(blocks.length, 2, 'one block per club');
assert(blocks[0].indexOf(AWAY) !== -1, 'the away club leads');
assert(blocks[1].indexOf(HOME) !== -1, 'the home club follows');
assert(/Team total<\/span><span>Over<\/span><span>Under<\/span>/.test(board), 'each block is headed Team total / Over / Under');

const away = readRows(blocks[0]);
assert.deepStrictEqual(away.map((r) => r.line), [2.5, 3.5, 4.5, 11.5],
    'every priced rung above the MLB floor, ascending, with no duplicate numbers');
assert.deepStrictEqual(away.find((r) => r.line === 3.5).prices, ['-128', '-102'],
    'a rung both books price stays one row, at the book that prices more of the ladder');
assert.deepStrictEqual(away.find((r) => r.line === 2.5).prices, ['-245', '+186'], 'alternate prices come straight from the feed');
assert.deepStrictEqual(away.find((r) => r.line === 11.5).prices, ['+2200', null], 'a one-sided rung shows the side it has');
assert.strictEqual(away.filter((r) => r.main).length, 1, 'exactly one rung is tagged Main');
assert.strictEqual(away.find((r) => r.main).line, 3.5, 'the main number is the rung the backend flags, not the first one in feed order');

const home = readRows(blocks[1]);
assert.deepStrictEqual(home.map((r) => r.line), [3.5, 4.5], 'the other club reads the same way');
assert.strictEqual(home.find((r) => r.main).line, 3.5, 'and keeps its own main number');

// Every price carries the whole wager: club, side, the exact number, the price,
// the market and the game. An alternate TEAM total is never a GAME total.
const picks = (board.match(/data-pick="([^"]*)"/g) || []).map((m) => JSON.parse(
    m.slice(11, -1).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')));
assert.strictEqual(picks.length, 11, 'eleven priced rungs across both clubs');
picks.forEach((p) => {
    assert.strictEqual(p.marketType, 'team_totals', 'an alternate team total is never an alternate game total');
    assert.strictEqual(p.groupLabel, 'Team Totals');
    assert.strictEqual(p.game, AWAY + ' @ ' + HOME);
    assert(/^(.+) (Over|Under)$/.test(p.selection), 'the selection names the club and the side');
    assert.strictEqual(p.label, p.selection + ' ' + p.line, 'the slip line reads club, side, exact number');
    assert(p.line != null && Number.isFinite(Number(p.odds)), 'every rung carries its own line and its own price');
});
const keys = picks.map((p) => [p.selection, p.line].join('|'));
assert.strictEqual(new Set(keys).size, keys.length, 'no duplicate markets');

console.log('sportsbook alt team totals lock test passed');

// ---- harness ---------------------------------------------------------------
function renderTeamTotals(game, sportKey, sportParam) {
    const boardKey = sportKey || 'baseball_mlb';
    const boardRe = new RegExp('games/board/' + boardKey);
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
    // A promise that settles in place, so load()'s then-chain runs before
    // load() returns and the test needs no timers.
    const settled = (value) => ({
        then(fn) { const out = fn ? fn(value) : value; return (out && out.then) ? out : settled(out); },
        catch() { return this; },
    });
    const doc = {
        readyState: 'complete',
        getElementById: (id) => (id === 'sbnBoard' ? boardNode : null),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        createElement: () => stub(),
        documentElement: { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
        body: stub(),
    };
    const ctx = {
        console, JSON, Math, Date, Number, String, Object, Array, URLSearchParams, RegExp, isNaN, parseInt, parseFloat,
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        document: doc,
        location: { search: '?sport=' + (sportParam || 'MLB'), pathname: '/sportsbook/next/' },
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
    assert(api, 'the board engine must boot onto #sbnBoard');
    assert(api.state.games.length === 1, 'the fixture game must reach the board');
    api.state.cat = 'team_totals';
    api.render();
    assert(/sbn-ttteam/.test(html), 'the Team Totals tab must render the per-club grid');
    return html;
}
// ALT_TEAM_TOTALS_COVERAGE_20260907. NFL and NCAAF reach the board with the
// book's whole 21-rung ladder and no main number named anywhere, because the
// primary feed posts no football team total to name one from. The old rule
// called the FIRST two-sided rung the main number, which on an ascending ladder
// would have stamped "Main" on the longest shot on the board. A ladder nobody
// flagged shows no badge at all rather than a wrong one.
(function unflaggedLadderIsNeverBadged() {
    const NFL_AWAY = 'Chicago Bears';
    const NFL_HOME = 'Carolina Panthers';
    const items = [];
    [12.5, 17.5, 20.5, 24.5].forEach(function (line, i) {
        items.push(rung('DraftKings', NFL_AWAY, 'Over', line, -200 + i * 40));
        items.push(rung('DraftKings', NFL_AWAY, 'Under', line, 150 + i * 10));
    });
    const nflBoard = renderTeamTotals({
        id: 'fixture_nfl', sport_key: 'americanfootball_nfl',
        away_team: NFL_AWAY, home_team: NFL_HOME,
        commence_time: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
        bookmakers: [{ key: 'draftkings', title: 'DraftKings', markets: [
            { key: 'h2h', outcomes: [{ name: NFL_AWAY, price: 150 }, { name: NFL_HOME, price: -175 }] },
        ] }],
        market_groups: [{ key: 'team_totals', label: 'Team Totals', items: items }],
    }, 'americanfootball_nfl', 'NFL');
    const nflRows = readRows(nflBoard.split('<div class="sbn-ttteam">')[1]);
    assert.deepStrictEqual(nflRows.map((r) => r.line), [12.5, 17.5, 20.5, 24.5],
        'the whole football ladder renders, ascending');
    assert.strictEqual(nflRows.filter((r) => r.main).length, 0,
        'no rung is badged Main when the feed named none');
}());

function readRows(block) {
    const chunks = block.split('<div class="sbn-ttrow').slice(1);
    return chunks.map((row) => {
        const line = Number(/<span class="sbn-ttline">([-0-9.]+)/.exec(row)[1]);
        const prices = [];
        const re = /<span class="sbn-chip-top">([^<]*)<\/span>/g;
        let m;
        while ((m = re.exec(row))) prices.push(m[1] === '&mdash;' ? null : m[1]);
        while (prices.length < 2) prices.push(null);
        return { line: line, main: /^ is-main"/.test(row), prices: prices.slice(0, 2) };
    });
}
