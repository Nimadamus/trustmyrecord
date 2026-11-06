#!/usr/bin/env node
/**
 * SIM_HANDOFF_NEXT_20261105. GA4, 30 days to 11/05: 35 people started a pick
 * from a simulator, 1 submitted; 9 started after the 11/01 fix, 0 submitted.
 *
 * Boots the REAL sportsbook-next.js and the REAL sim-pick-prefill.js together
 * against a stubbed DOM, with the classic window.selectGameBet present the way
 * the live page has it, and checks the visible slip, not the banner:
 *   - the board opens the intent's sport, the pick is on sportsbook-next's slip
 *     at the board's price, and the classic hidden slip is not used
 *   - all sports, swapped home/away, LA / St. / accent spellings
 *   - game off the board: nothing selected, honest banner
 *   - totals at the exact line, and a moved line selects nothing
 *   - the classic path still works when the new board is not mounted
 *   - logged out Lock keeps ?simpick=1 through a URL the auth pages really read
 *   - the funnel event fires once for a saved pick
 * No browser, no network. Set HANDOFF_SRC_DIR to run it against other copies of
 * the two scripts (that is how it was shown to fail on the old code).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = process.env.HANDOFF_SRC_DIR || path.join(ROOT, 'static', 'js');
const nextSrc = fs.readFileSync(path.join(SRC, 'sportsbook-next.js'), 'utf8');
const prefillSrc = fs.readFileSync(path.join(SRC, 'sim-pick-prefill.js'), 'utf8');

const API_KEY = { NFL: 'americanfootball_nfl', NBA: 'basketball_nba', NHL: 'icehockey_nhl', MLB: 'baseball_mlb' };

function game(id, sport, away, home, opts) {
    const o = opts || {};
    const start = new Date(Date.now() + 864e5).toISOString();
    return {
        id, sport_key: API_KEY[sport], away_team: away, home_team: home, commence_time: start,
        bookmakers: [{
            key: 'draftkings', title: 'DraftKings',
            markets: [
                { key: 'h2h', outcomes: [{ name: away, price: 145 }, { name: home, price: -165 }] },
                { key: 'totals', outcomes: [
                    { name: 'Over', price: -110, point: o.total || 44.5 },
                    { name: 'Under', price: -110, point: o.total || 44.5 }] },
            ],
        }],
    };
}

function boot(cfg) {
    const boards = cfg.boards;
    const store = { tmr_sim_pick_intent: JSON.stringify(Object.assign({ v: 1, ts: Date.now() }, cfg.intent)) };
    let boardHtml = '', slipHtml = '';
    const timers = [];
    const events = [];
    const banners = [];
    const classicCalls = [];
    const stub = () => ({
        className: '', style: { cssText: '' }, dataset: {}, textContent: '', innerHTML: '', parentNode: null,
        appendChild() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
        addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        closest() { return null; }, focus() {}, scrollIntoView() {}, remove() {},
    });
    const boardNode = stub();
    Object.defineProperty(boardNode, 'innerHTML', { get() { return boardHtml; }, set(v) { boardHtml = v; } });
    const slipNode = stub();
    Object.defineProperty(slipNode, 'innerHTML', { get() { return slipHtml; }, set(v) { slipHtml = v; } });
    const settled = (value) => ({
        then(fn) { const out = fn ? fn(value) : value; return (out && out.then) ? out : settled(out); },
        catch() { return this; },
    });
    const mounted = cfg.mounted !== false;
    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        JSON, Math, Date, Number, String, Object, Array, URLSearchParams, RegExp, isNaN, isFinite, parseInt, parseFloat,
        encodeURIComponent, decodeURIComponent,
        setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        document: {
            readyState: 'complete',
            getElementById: (id) => {
                if (!mounted) return null;
                if (id === 'sbnBoard') return boardNode;
                if (id === 'sbnSlip') return slipNode;
                return null;
            },
            querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
            createElement: () => {
                const n = stub();
                Object.defineProperty(n, 'innerHTML', { get() { return ''; }, set(v) { banners.push(v); } });
                return n;
            },
            documentElement: { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
            body: Object.assign(stub(), { insertBefore() {}, firstChild: null }),
        },
        location: { search: cfg.search || '?simpick=1', pathname: '/sportsbook/', href: '' },
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        },
        fetch: (url) => {
            const hit = Object.keys(boards).find((s) => String(url).includes('games/board/' + API_KEY[s]));
            return settled({ ok: true, json: () => settled({ games: hit ? boards[hit] : [] }) });
        },
        TMRAnalytics: { track: (n, p) => events.push(n) },
    };
    ctx.window = ctx;
    ctx.self = ctx;
    ctx.window.location = ctx.location;
    if (mounted) ctx.__SBN_MOUNT = true;
    if (cfg.loggedIn !== undefined) ctx.auth = { isLoggedIn: () => cfg.loggedIn };
    const posted = [];
    ctx.api = {
        baseUrl: 'https://api.invalid/api',
        request(p, o) { posted.push({ p, o }); return settled({ pick: { id: 77 } }); },
        createPick(body) { return this.request('/picks', { method: 'POST', body }); },
    };
    /* The live page: this exists whichever board is showing. It feeds the
       classic multi slip, which the visitor cannot see under the new board. */
    ctx.selectGameBet = (...a) => classicCalls.push(a);
    ctx.TMR = cfg.classicGames ? { currentGames: cfg.classicGames, selectedSport: cfg.classicSport } : {};
    ctx.selectSportAndShowGames = () => {};
    vm.createContext(ctx);
    vm.runInContext(nextSrc, ctx, { filename: 'sportsbook-next.js' });
    vm.runInContext(prefillSrc, ctx, { filename: 'sim-pick-prefill.js' });
    let guard = 0;
    while (timers.length && guard++ < 400) timers.shift()();
    return { ctx, events, banners, classicCalls, posted, store, slip: () => slipHtml, sb: ctx.__sbNext };
}

const nfl = [game('g1', 'NFL', 'Buffalo Bills', 'Miami Dolphins'), game('g2', 'NFL', 'Detroit Lions', 'Chicago Bears')];
const nba = [game('b1', 'NBA', 'Los Angeles Clippers', 'Sacramento Kings')];
const nhl = [game('h1', 'NHL', 'Montreal Canadiens', 'St Louis Blues')];
const mlb = [game('m1', 'MLB', 'Athletics', 'Seattle Mariners')];

function checkOnSlip(r, sport, team, odds) {
    const picks = r.sb.state.picks;
    assert.strictEqual(r.sb.state.sport, sport, 'the visible board opens the intent sport');
    assert.strictEqual(picks.length, 1, sport + ': the pick is on the slip the visitor can see');
    assert.strictEqual(picks[0].selection, team);
    assert.strictEqual(picks[0].odds, odds, 'board price, unchanged');
    assert.strictEqual(picks[0].marketType, 'h2h');
    assert.ok(r.slip().includes(team + ' ML'), 'the slip shows it');
    assert.strictEqual(r.classicCalls.length, 0, 'the hidden classic slip is not used');
    assert.strictEqual(r.posted.length, 0, 'nothing submits on arrival');
    assert.ok(r.events.includes('simulator_pick_preselected'));
}

// NFL, default page sport is MLB with an empty MLB board: the case 30 of 35 starts took
let r = boot({
    boards: { MLB: [], NFL: nfl, NBA: nba, NHL: nhl },
    intent: { pick_team: 'Detroit Lions', away_team_name: 'Detroit Lions', home_team_name: 'Chicago Bears', board_game_id: null, sport: 'NFL', source: 'nfl-simulator' },
    loggedIn: true,
});
checkOnSlip(r, 'NFL', 'Detroit Lions', 145);

// NBA with the sim's LA spelling, opened while another sport has games
r = boot({
    boards: { MLB: mlb, NFL: nfl, NBA: nba, NHL: nhl },
    intent: { pick_team: 'LA Clippers', away_team_name: 'LA Clippers', home_team_name: 'Sacramento Kings', board_game_id: null, sport: 'NBA', source: 'nba-simulator' },
    loggedIn: true,
});
checkOnSlip(r, 'NBA', 'Los Angeles Clippers', 145);

// NHL with accent and St. spelling, home side
r = boot({
    boards: { MLB: [], NFL: nfl, NBA: nba, NHL: nhl },
    intent: { pick_team: 'St. Louis Blues', away_team_name: 'Montréal Canadiens', home_team_name: 'St. Louis Blues', board_game_id: null, sport: 'NHL', source: 'nhl-simulator' },
    loggedIn: true,
});
checkOnSlip(r, 'NHL', 'St Louis Blues', -165);

// MLB by board id
r = boot({
    boards: { MLB: mlb },
    intent: { pick_team: 'Seattle Mariners', away_team_name: 'Athletics', home_team_name: 'Seattle Mariners', board_game_id: 'm1', sport: 'MLB', source: 'mlb-simulator' },
    loggedIn: true,
});
checkOnSlip(r, 'MLB', 'Seattle Mariners', -165);

// a custom matchup simulated with the venues swapped is still that game
r = boot({
    boards: { MLB: [], NFL: nfl },
    intent: { pick_team: 'Buffalo Bills', away_team_name: 'Miami Dolphins', home_team_name: 'Buffalo Bills', board_game_id: null, sport: 'NFL', source: 'nfl-simulator' },
    loggedIn: true,
});
checkOnSlip(r, 'NFL', 'Buffalo Bills', 145);

// off the board: right sport open, nothing selected, says so
r = boot({
    boards: { MLB: [], NFL: nfl },
    intent: { pick_team: 'Dallas Cowboys', away_team_name: 'Dallas Cowboys', home_team_name: 'New York Giants', board_game_id: null, sport: 'NFL', source: 'nfl-simulator' },
    loggedIn: true,
});
assert.strictEqual(r.sb.state.sport, 'NFL');
assert.strictEqual(r.sb.state.picks.length, 0);
assert.ok(r.banners.some((b) => /not on the current board/.test(b)));
assert.ok(!r.banners.some((b) => /pre-selected/.test(b)), 'never claims a selection it did not make');
assert.ok(r.events.includes('simulator_pick_off_board'));

// poll total at the exact line, then a moved line
r = boot({
    boards: { MLB: [], NFL: nfl },
    intent: { market: 'over', side: 'Over', line: 44.5, away_team_name: 'Detroit Lions', home_team_name: 'Chicago Bears', sport: 'NFL', source: 'poll' },
    loggedIn: true,
});
assert.strictEqual(r.sb.state.picks.length, 1);
assert.strictEqual(r.sb.state.picks[0].selection, 'Over');
assert.strictEqual(r.sb.state.picks[0].line, 44.5);
r = boot({
    boards: { MLB: [], NFL: nfl },
    intent: { market: 'under', side: 'Under', line: 47.5, away_team_name: 'Detroit Lions', home_team_name: 'Chicago Bears', sport: 'NFL', source: 'poll' },
    loggedIn: true,
});
assert.strictEqual(r.sb.state.picks.length, 0, 'a moved total selects nothing');
assert.ok(r.banners.some((b) => /has moved from 47.5 to 44.5/.test(b)));

// classic board (?sbnext=0 or a failed mount) keeps the old bridge
r = boot({
    mounted: false, boards: {}, classicGames: [{
        id: 'g2', away_team: 'Detroit Lions', home_team: 'Chicago Bears',
        bookmakers: game('g2', 'NFL', 'Detroit Lions', 'Chicago Bears').bookmakers,
    }], classicSport: 'NFL',
    intent: { pick_team: 'Detroit Lions', away_team_name: 'Detroit Lions', home_team_name: 'Chicago Bears', sport: 'NFL', source: 'nfl-simulator' },
});
assert.strictEqual(r.classicCalls.length, 1, 'classic path still selects');
assert.strictEqual(r.classicCalls[0][2], 'Detroit Lions');

// logged out: Lock goes through a URL the auth pages really read, ?simpick=1 intact
r = boot({
    boards: { MLB: [], NFL: nfl },
    intent: { pick_team: 'Detroit Lions', away_team_name: 'Detroit Lions', home_team_name: 'Chicago Bears', sport: 'NFL', source: 'nfl-simulator' },
    loggedIn: false,
});
assert.strictEqual(r.sb.state.picks.length, 1, 'a logged out visitor still sees the pick');
const lockHandler = nextSrc.match(/if \(!loggedIn\(\)\) \{[^\n]*\n/)[0];
assert.ok(!/\/login\/\?return=/.test(lockHandler), 'the login page ignores ?return=, so Lock must not send it');
const login = fs.readFileSync(path.join(ROOT, 'login', 'index.html'), 'utf8');
const register = fs.readFileSync(path.join(ROOT, 'register', 'index.html'), 'utf8');
assert.ok(/params\.get\('next'\)/.test(login), 'login reads ?next=');
assert.ok(!/params\.get\('return'\)/.test(login), 'login does not read ?return=');
assert.ok(/returnParams\.get\('return'\)/.test(register), 'register reads ?return=');
assert.ok(/id="registerToLogin"/.test(register) && /'\/login\/\?next=' \+ encodeURIComponent/.test(register),
    'someone with an account can leave the sign up page without losing the way back');
const auth = nextSrc.match(/function sendToAuth\(\) \{[\s\S]*?\n    \}\n/);
assert.ok(auth, 'sendToAuth exists');
const loc = { pathname: '/sportsbook/', search: '?simpick=1' };
const win = { location: {} };
vm.runInNewContext('(' + auth[0].trim() + ')()', { announce() {}, encodeURIComponent, window: win, location: loc });
assert.strictEqual(win.location.href, '/register/?return=%2Fsportsbook%2F%3Fsimpick%3D1');
const win2 = { location: {} };
vm.runInNewContext('(' + auth[0].trim() + ')()', { announce() {}, encodeURIComponent, window: win2, location: { pathname: '/sportsbook/', search: '' } });
assert.strictEqual(win2.location.href, '/login/?next=%2Fsportsbook%2F');

// the funnel event: once, after a saved pick, and the intent is spent
r = boot({
    boards: { MLB: [], NFL: nfl },
    intent: { pick_team: 'Detroit Lions', away_team_name: 'Detroit Lions', home_team_name: 'Chicago Bears', sport: 'NFL', source: 'nfl-simulator' },
    loggedIn: true,
});
r.ctx.api.createPick({ a: 1 });
r.ctx.api.createPick({ a: 2 });
assert.strictEqual(r.events.filter((e) => e === 'simulator_pick_submitted').length, 1, 'counted once');
assert.ok(!('tmr_sim_pick_intent' in r.store), 'intent spent');

console.log('sim-pick-next-board-handoff-test: all checks passed');
