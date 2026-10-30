/* =============================================================================
   ANONYMOUS FREE RUN: SPENT ONLY ON A RESULT            ANON_RUN_SETTLE_20261030
   -----------------------------------------------------------------------------
   Audit 2026-10-30: the signed out visitor's one free simulation was spent at
   the gate, BEFORE the run, and never given back:
     * a run that failed still used it up;
     * /nba-simulator/?away=BOS&home=NY ran itself on page load and used it up
       before the visitor pressed anything (a reload of a result URL did too);
     * a double click could start two runs.
   This runs the REAL gate, the REAL NBA/NHL adapter and the REAL sim core in
   jsdom and locks, each of which FAILS on the old code:
     1. a click reserves the free run; only a result spends it;
     2. a failed run spends nothing and the visitor can run again, ungated;
     3. a second click while the first run is in flight starts nothing;
     4. two checks inside one action still count as one;
     5. a deep link selects the matchup and does NOT run; its seed is used by
        the first Run press on that matchup;
     6. NBA/NHL adapter: a run with no result spends nothing, a result spends it;
        a seed that is not the shown result's is a metered run;
     7. member: a second start while a metered run is open is refused (one
        /start), and a failed run sends /fail, never /complete;
     8. the NFL page reports a run that ended with no result.
   Run: node tests/sim-anon-run-settle-test.js
   ============================================================================= */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const GATE_SRC = read('static/js/sim-auth-gate.js');
const ADAPTER_SRC = read('static/js/sim-run-gate.js');
const CORE_SRC = read('static/js/tmr-sim-core.js');
const NFL_HTML = read('nfl-simulator/index.html');
const FREE_KEY = 'tmr_sim_anon_free_used';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok  ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeWindow(url, loggedIn, api) {
    const dom = new JSDOM('<!doctype html><html><body><button id="runBtn">Run</button></body></html>', {
        url: url || 'https://trustmyrecord.com/nba-simulator/', runScripts: 'outside-only', pretendToBeVisual: true
    });
    const w = dom.window;
    w.SIM_GATE_FLAGS = { gate: true, resume: false, autoSave: false };
    w.api = api || { isLoggedIn: () => !!loggedIn, request: () => Promise.reject(new Error('no network in test')) };
    w.fetch = () => Promise.reject(new Error('no network in test'));
    w.navigator.sendBeacon = () => true;
    w.eval(GATE_SRC);
    return w;
}
const gateOpen = (w) => !!w.document.querySelector('.tsg-overlay');
const spent = (w) => !!w.localStorage.getItem(FREE_KEY);

/* Fake SimApp: a run ends after 20 ms with (ok) or without (fail) a result. */
function installFakeSim(w, outcome) {
    const runs = [];
    function SimApp() { this.running = false; this.lastResult = null; }
    SimApp.prototype.currentTeams = function () { return { away: { ref: 'bos' }, home: { ref: 'ny' } }; };
    SimApp.prototype.run = function (opts) {
        const self = this;
        if (self.running) return;
        runs.push(opts || {});
        self.running = true;
        setTimeout(function () {
            if (outcome.ok) self.lastResult = { meta: { seed: (opts && opts.seed) || 4242 } };
            self.running = false;
        }, 20);
    };
    w.TMRSim = { SimApp: SimApp, esc: (s) => s };
    return { SimApp, runs };
}
function loadAdapter(w, sport) {
    const s = w.document.createElement('script');
    s.setAttribute('data-sport', sport);
    Object.defineProperty(w.document, 'currentScript', { value: s, configurable: true });
    w.eval(ADAPTER_SRC);
}

(async () => {
    /* 1 to 4: the gate contract for a new signed out visitor. */
    {
        const w = makeWindow();
        w.TMRSimGate.register({ simulator: 'nba', label: 'NBA matchup' });
        const first = w.TMRSimGate.requireAuth({ t: 1 });
        ok('1. first click is allowed', first === true);
        ok('1. the click alone spends nothing', !spent(w));
        ok('4. a re-check inside the same action is still allowed', w.TMRSimGate.requireAuth({ t: 'same' }) === true);
        await sleep(300);
        ok('3. a second click while the run is in flight starts nothing', w.TMRSimGate.requireAuth({ t: 2 }) === false);
        ok('3. ...and opens no signup gate', !gateOpen(w));
        w.TMRSimGate.runSucceeded();
        ok('1. the result spends the free run', spent(w));
        w.TMRSimGate.runSucceeded();
        ok('1. the next click after the result is gated', w.TMRSimGate.requireAuth({ t: 3 }) === false && gateOpen(w));
    }
    {
        const w = makeWindow();
        w.TMRSimGate.register({ simulator: 'nba', label: 'NBA matchup' });
        w.TMRSimGate.requireAuth({ t: 1 });
        w.TMRSimGate.runFailed('server error');
        ok('2. a failed run spends nothing', !spent(w));
        await sleep(300);
        ok('2. after a failure the visitor can run again, ungated', w.TMRSimGate.requireAuth({ t: 2 }) === true && !gateOpen(w));
        w.TMRSimGate.markCompleted({});
        ok('2. that run\'s result spends it, once', spent(w));
    }
    {
        // A "Try again" of the failed run that then succeeds still spends it.
        const w = makeWindow();
        w.TMRSimGate.register({ simulator: 'nfl', label: 'NFL matchup' });
        w.TMRSimGate.requireAuth({ t: 1 });
        w.TMRSimGate.runFailed('error');
        w.TMRSimGate.markCompleted({});
        ok('2. a retried run that succeeds spends the free run', spent(w));
    }
    {
        // Another tab already holds the free run.
        const w = makeWindow();
        w.TMRSimGate.register({ simulator: 'nba', label: 'NBA matchup' });
        w.localStorage.setItem('tmr_sim_anon_free_hold', JSON.stringify({ id: 'othertab', at: Date.now() }));
        ok('3. a second tab can not start a second free run', w.TMRSimGate.requireAuth({}) === false && !spent(w));
    }

    /* 5: deep link selects, never runs. */
    {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            url: 'https://trustmyrecord.com/nba-simulator/?away=BOS&home=NY&seed=987', runScripts: 'outside-only'
        });
        const w = dom.window;
        w.eval(CORE_SRC);
        const P = w.TMRSim.SimApp.prototype;
        const runs = [];
        const fake = Object.create(P);
        fake.teams = [{ abbr: 'BOS', slug: 'boston', ref: 'bos' }, { abbr: 'NY', slug: 'new-york', ref: 'ny' }];
        fake.nodes = { away: { value: '' }, home: { value: '' }, venueSeg: w.document.body };
        fake.state = { away: null, home: null, venue: 'home' };
        fake.cfg = {};
        fake.setMode = () => {}; fake.clearScenario = () => {}; fake.renderPrerun = () => {};
        fake.run = (o) => runs.push(o);
        fake.applyUrl();
        ok('5. a deep link selects the matchup', fake.state.away === 'bos' && fake.state.home === 'ny');
        ok('5. a deep link does NOT run on page load', runs.length === 0, JSON.stringify(runs));
        ok('5. the linked seed is used by the first Run press on that matchup', fake.takePendingSeed() === 987);
        ok('5. ...once', fake.takePendingSeed() === null);
        fake.applyUrl(); fake.state.home = 'other';
        ok('5. a changed matchup drops the linked seed', fake.takePendingSeed() === null);
    }

    /* 6: NBA/NHL adapter settles every run. */
    for (const outcome of [{ ok: false }, { ok: true }]) {
        const w = makeWindow();
        const sim = installFakeSim(w, outcome);
        loadAdapter(w, 'nba');
        const app = new sim.SimApp();
        app.run({ fresh: true });
        await sleep(450);
        ok('6. adapter ' + (outcome.ok ? 'result spends the free run' : 'run with no result spends nothing'),
            spent(w) === outcome.ok && sim.runs.length === 1);
    }
    {
        // Member: a foreign seed is a metered run; the shown seed is a what-if.
        const calls = [];
        const api = {
            isLoggedIn: () => true,
            request: (p, o) => {
                calls.push(p);
                if (p.indexOf('/status') !== -1) return Promise.resolve({ metered: true, freeAvailable: true });
                if (p === '/simulator-runs/start') return Promise.resolve({ metered: true, isFree: true, runId: 7 + calls.length, cost: 0 });
                return Promise.resolve({ status: 'charged', charged: 0 });
            }
        };
        const w = makeWindow(null, true, api);
        const sim = installFakeSim(w, { ok: true });
        loadAdapter(w, 'nba');
        const app = new sim.SimApp();
        app.run({ fresh: true, seed: 555 });
        await sleep(450);
        const starts = () => calls.filter((c) => c === '/simulator-runs/start').length;
        ok('6. a shared link seed is a metered run for a member', starts() === 1, calls.join(','));
        app.run({ seed: 555 });
        await sleep(450);
        ok('6. a what-if on the shown result is not metered', starts() === 1 && sim.runs.length === 2, calls.join(','));
    }

    /* 7: member double submit and failure. */
    {
        const calls = [];
        const api = {
            isLoggedIn: () => true,
            request: (p) => {
                calls.push(p);
                if (p.indexOf('/status') !== -1) return Promise.resolve({ metered: true, freeAvailable: true });
                if (p === '/simulator-runs/start') return Promise.resolve({ metered: true, isFree: true, runId: 31, cost: 0 });
                return Promise.resolve({ status: 'failed', charged: 0 });
            }
        };
        const w = makeWindow(null, true, api);
        w.TMRSimGate.register({ simulator: 'nba', label: 'NBA matchup' });
        const a = await w.TMRSimGate.authorizeRun({});
        const b = await w.TMRSimGate.authorizeRun({});
        const starts = calls.filter((c) => c === '/simulator-runs/start').length;
        ok('7. member: second start while a run is open is refused', a === true && b === false && starts === 1, calls.join(','));
        w.TMRSimGate.runFailed('boom');
        await sleep(20);
        ok('7. member: a failed run sends /fail, never /complete',
            calls.some((c) => /\/31\/fail$/.test(c)) && !calls.some((c) => /complete$/.test(c)), calls.join(','));
        const c = await w.TMRSimGate.authorizeRun({});
        ok('7. member: after it settles a new run may start', c === true);
    }

    /* 8: the NFL page reports a run with no result. */
    ok('8. NFL wrapper settles scheduled and custom runs',
        /_settleRun\(_runScheduled\(ref,seed\)\)/.test(NFL_HTML) && /_settleRun\(_runCustom\(seed\)\)/.test(NFL_HTML)
        && /simDone===before&&window\.TMRSimGate\.runFailed/.test(NFL_HTML));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
