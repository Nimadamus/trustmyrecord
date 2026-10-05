/* =============================================================================
   SIM RUN METER: CHARGE ON SUCCESS                    SIM_RUN_SETTLE_20261005
   -----------------------------------------------------------------------------
   The meter used to charge 5 TMR before the run started, so a failed run still
   cost the member. This runs the REAL gate (static/js/sim-auth-gate.js) in
   jsdom as a signed in member against a recording fake API and locks:
   1. A run starts with POST /simulator-runs/start (never /charge).
   2. A finished result settles it with ONE POST /:id/complete.
   3. A failed run settles with /:id/fail, never /complete.
   4. Settling twice, or with no open run, sends nothing.
   5. markCompleted (NFL, MLB pages) settles the open run as a success.
   6. Every simulator engine reports success and failure to the gate.
   Run: node tests/sim-run-settle-test.js
   ============================================================================= */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const GATE_SRC = read('static/js/sim-auth-gate.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok  ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
const tick = () => new Promise((r) => setTimeout(r, 30));

function member(statusBody, oldServer) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'https://trustmyrecord.com/nba-simulator/', runScripts: 'outside-only', pretendToBeVisual: true
    });
    const w = dom.window;
    const calls = [];
    let nextId = 100;
    w.SIM_GATE_FLAGS = { gate: true, resume: false, autoSave: false };
    w.localStorage.setItem('tmr_sim_anon_free_used', '1');
    w.api = {
        isLoggedIn: () => true,
        request: (p, o) => {
            calls.push({ path: p, method: (o && o.method) || 'GET', body: o && o.body });
            if (p.indexOf('/simulator-runs/status') === 0) return Promise.resolve(statusBody);
            if (p === '/simulator-runs/start' && oldServer) { const e = new Error('not found'); e.status = 404; return Promise.reject(e); }
            if (p === '/simulator-runs/charge') return Promise.resolve({ allowed: true, metered: true, isFree: false, charged: 5, balance: 15 });
            if (p === '/simulator-runs/start') return Promise.resolve({ allowed: true, metered: true, isFree: !!statusBody.freeAvailable, runId: nextId++, cost: statusBody.freeAvailable ? 0 : 5, charged: 0 });
            if (/\/complete$/.test(p)) return Promise.resolve({ status: 'charged', charged: statusBody.freeAvailable ? 0 : 5, balance: 15 });
            if (/\/fail$/.test(p)) return Promise.resolve({ status: 'failed', charged: 0 });
            return Promise.reject(new Error('unexpected ' + p));
        }
    };
    w.fetch = () => Promise.reject(new Error('no network in test'));
    w.navigator.sendBeacon = () => true;
    w.eval(GATE_SRC);
    w.TMRSimGate.register({ simulator: 'nba', label: 'NBA matchup', returnPath: '/nba-simulator/' });
    return { w, calls, G: w.TMRSimGate };
}
const posts = (calls) => calls.filter((c) => c.method === 'POST' && c.path.indexOf('/simulator-runs') === 0).map((c) => c.path);

(async () => {
    // Free run: start, then success.
    let m = member({ metered: true, freeAvailable: true, balance: 20, canAfford: true });
    let go = await m.G.authorizeRun({ trigger: 'test' });
    ok('a free run is allowed', go === true);
    ok('it starts with /simulator-runs/start, never the old /charge', posts(m.calls).join() === '/simulator-runs/start', posts(m.calls).join());
    m.G.runSucceeded(); await tick();
    ok('a finished run is settled with one /complete', posts(m.calls).join() === '/simulator-runs/start,/simulator-runs/100/complete', posts(m.calls).join());
    m.G.runSucceeded(); m.G.runFailed('late'); m.G.markCompleted({}); await tick();
    ok('settling again sends nothing more', posts(m.calls).length === 2, posts(m.calls).join());

    // Paid run that fails.
    m = member({ metered: true, freeAvailable: false, balance: 20, canAfford: true });
    const asked = m.G.authorizeRun({ trigger: 'test' });
    await tick();
    const pay = m.w.document.getElementById('tsgMeterPay');
    ok('a paid run asks the member first', !!pay);
    pay.click();
    go = await asked;
    ok('saying yes starts the run', go === true && posts(m.calls).join() === '/simulator-runs/start', posts(m.calls).join());
    m.G.runFailed('engine error'); await tick();
    ok('a failed run is settled with /fail and never /complete', posts(m.calls).join() === '/simulator-runs/start,/simulator-runs/100/fail', posts(m.calls).join());
    const failCall = m.calls.find((c) => /\/fail$/.test(c.path));
    ok('the failure reason is sent', failCall && failCall.body && failCall.body.reason === 'engine error');

    // markCompleted (NFL and MLB pages) settles as success.
    go = await m.G.authorizeRun({ trigger: 'again' });
    m.G.markCompleted({ simulation_type: 'nfl_game' }); await tick();
    ok('markCompleted settles the open run as a success', posts(m.calls).slice(-2).join() === '/simulator-runs/start,/simulator-runs/101/complete', posts(m.calls).join());

    // Nothing open: nothing sent.
    const before = posts(m.calls).length;
    m.G.runSucceeded(); m.G.runFailed('x'); await tick();
    ok('with no open run nothing is sent', posts(m.calls).length === before);

    // Every engine reports to the gate.
    const runGate = read('static/js/sim-run-gate.js');
    ok('NBA and NHL wrapper settles on a new result and fails otherwise',
        /self\.lastResult !== before/.test(runGate) && /G\.runSucceeded\(\)/.test(runGate) && /G\.runFailed\('no result'\)/.test(runGate));
    for (const f of ['static/js/league-season-sim.js', 'static/js/nfl-season-sim.js']) {
        const src = read(f);
        ok(f + ' settles success and failure', /settle\(true\)/.test(src) && /settle\(false/.test(src) && /runSucceeded/.test(src) && /runFailed/.test(src));
    }
    const playoff = read('static/js/nfl-playoff-sim.js');
    ok('NFL playoff simulator settles success and failure', /G\.runSucceeded\(\)/.test(playoff) && /G\.runFailed\('simulation error'\)/.test(playoff));
    ok('MLB and NFL game pages still call markCompleted on a result',
        /markCompleted\(/.test(read('static/js/mlb-simulator-gate.js')) && /markCompleted\(/.test(read('nfl-simulator/index.html')));

    // A server without /start yet: the old /charge is used and nothing is settled later.
    m = member({ metered: true, freeAvailable: true, balance: 20, canAfford: true }, true);
    go = await m.G.authorizeRun({ trigger: 'old' });
    m.G.runSucceeded(); await tick();
    ok('against a server without /start the old /charge is used, and no settle call follows', go === true &&
        posts(m.calls).join() === '/simulator-runs/start,/simulator-runs/charge', posts(m.calls).join());

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
