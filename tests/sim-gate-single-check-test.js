/* =============================================================================
   SIM GATE: ONE CHECK PER CLICK                     SIM_GATE_SINGLE_CHECK_20261005
   -----------------------------------------------------------------------------
   Oct 5, 2026: a first time visitor on /nfl-simulator/ tapped a game and was
   told "You used your free simulation" without ever running one. The page's
   run wrapper called TMRSimGate.requireAuth and then TMRSimGate.authorizeRun,
   which calls requireAuth again. The first check spent the site wide free run,
   the second found it spent and opened the gate.

   This runs the REAL gate (static/js/sim-auth-gate.js) and the REAL NFL run
   wrapper (lifted from nfl-simulator/index.html) in jsdom as a brand new
   visitor and locks:

   1. The first click on the NFL simulator is allowed and opens no gate.
   2. The free run is recorded once.
   3. The next click (a separate action) is gated with "You used your free
      simulation".
   4. The gate itself treats repeated checks inside one action as one check, so
      a future page that double calls cannot reintroduce the bug.
   5. The double call pattern does not come back into the NFL page.

   Run: node tests/sim-gate-single-check-test.js
   ============================================================================= */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const GATE_SRC = fs.readFileSync(path.join(ROOT, 'static/js/sim-auth-gate.js'), 'utf8');
const NFL_HTML = fs.readFileSync(path.join(ROOT, 'nfl-simulator/index.html'), 'utf8');
const FREE_KEY = 'tmr_sim_anon_free_used';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok  ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

/* A brand new signed out visitor: empty storage, no session. */
function freshVisitor() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'https://trustmyrecord.com/nfl-simulator/',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const w = dom.window;
    w.SIM_GATE_FLAGS = { gate: true, resume: true, autoSave: true };
    w.api = { isLoggedIn: () => false, request: () => Promise.reject(new Error('no network in test')) };
    w.fetch = () => Promise.reject(new Error('no network in test'));
    w.navigator.sendBeacon = () => true;
    w.eval(GATE_SRC);
    w.TMRSimGate.register({ simulator: 'nfl', label: 'NFL matchup', returnPath: '/nfl-simulator/' });
    return w;
}

/* The NFL page's run wrapper, exactly as shipped. */
const wrapperMatch = NFL_HTML.match(/const _authorizeRun=\(meta,seed\)=>\{[\s\S]*?\n  \};/);
ok('NFL page still defines its run wrapper _authorizeRun', !!wrapperMatch);

function nflWrapper(w) {
    return w.eval('(function(){' + wrapperMatch[0] + 'return _authorizeRun;})()');
}
const gateOpen = (w) => !!w.document.querySelector('.tsg-overlay');

(async () => {
    if (wrapperMatch) {
        // 1 to 3: first click runs, second click is gated.
        const w = freshVisitor();
        const realNow = w.Date.now;
        const authorize = nflWrapper(w);

        const first = await authorize({ sim_mode: 'weekly' });
        ok('first click by a new visitor is allowed', first === true, String(first));
        ok('first click opens no gate', !gateOpen(w));
        ok('the free run is recorded after the first click', !!w.localStorage.getItem(FREE_KEY));

        const later = realNow.call(w.Date) + 10000;
        w.Date.now = () => later;
        const second = await authorize({ sim_mode: 'weekly' });
        ok('the next click (separate action) is gated', second === false, String(second));
        ok('the gate opens on the next click', gateOpen(w));
        const text = gateOpen(w) ? w.document.querySelector('.tsg-overlay').textContent : '';
        ok('the gate says the free simulation was used', /You used your free simulation/.test(text), text.slice(0, 120));

        // A same seed rerun of the shown result on the first click is also one check.
        const w2 = freshVisitor();
        const rerun = await nflWrapper(w2)({ sim_mode: 'weekly' }, 12345);
        ok('a seeded first run is allowed too', rerun === true, String(rerun));
        ok('a seeded first run opens no gate', !gateOpen(w2));
    }

    // 4: gate contract. Two checks in one action are one check.
    const g = freshVisitor();
    const a = g.TMRSimGate.requireAuth({ trigger: 'adapter' });
    const stamp = g.localStorage.getItem(FREE_KEY);
    const b = await g.TMRSimGate.authorizeRun({ trigger: 'authorizeRun' });
    ok('gate: first requireAuth in an action is allowed', a === true);
    ok('gate: a repeated check in the same action is allowed', b === true, String(b));
    ok('gate: a repeated check opens no gate', !gateOpen(g));
    ok('gate: the free run stamp is written once', g.localStorage.getItem(FREE_KEY) === stamp);

    // 5: the old double call must not return to the NFL page.
    ok('NFL page does not call requireAuth before authorizeRun on the same click',
        !/if\(!window\.TMRSimGate\.requireAuth\(meta\)\)return Promise\.resolve\(false\);[\s\S]{0,200}authorizeRun\(meta\)/.test(NFL_HTML));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
