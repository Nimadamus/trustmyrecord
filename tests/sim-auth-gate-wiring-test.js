/* =============================================================================
   SIM AUTH GATE — static wiring lock                     SIM_AUTH_GATE_20260808
   -----------------------------------------------------------------------------
   Cheap, network-free guards for the simulator signup/activation funnel. These
   catch the failure modes that are invisible until a real visitor hits them:

   1. A simulator page that loads the gate adapter but not the gate core (or
      vice versa) — the gate silently no-ops and logged-out visitors run free.
   2. A missing kill switch — no way to roll back without a code change.
   3. The NFL page re-declaring a top-level `function api()`. That lands on
      window and CLOBBERS the sitewide backend client from backend-api.js, so
      window.api.isLoggedIn stops being a function and the gate treats every
      signed-in member as logged out. This actually happened during the build.
   4. Auth hand-off links that are not same-origin relative paths (open
      redirect) or that forget to ask for the resume.
   5. Any simulator page going noindex / losing its crawlable body.

   Run: node tests/sim-auth-gate-wiring-test.js
   ============================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok  ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

const SIM_PAGES = [
    { path: 'mlb-simulator/index.html', label: 'MLB simulator' },
    { path: 'nfl-simulator/index.html', label: 'NFL simulator' }
];

// ---- 1 + 2: every gated simulator loads the core and declares kill switches
for (const page of SIM_PAGES) {
    const html = read(page.path);

    ok(page.label + ' loads the shared gate core',
        /\/static\/js\/sim-auth-gate\.js/.test(html));

    const flags = html.match(/window\.SIM_GATE_FLAGS\s*=\s*\{([^}]*)\}/);
    ok(page.label + ' declares SIM_GATE_FLAGS', !!flags);
    if (flags) {
        ['gate', 'resume', 'autoSave'].forEach(k =>
            ok(page.label + ' has a ' + k + ' kill switch', new RegExp('\\b' + k + '\\s*:').test(flags[1]), flags[1]));
        ok(page.label + ' ships with the gate ON', /\bgate\s*:\s*true\b/.test(flags[1]));
    }

    // The flags object must be parsed BEFORE the gate core runs, or the kill
    // switch silently does nothing.
    ok(page.label + ' sets flags before loading the gate',
        html.indexOf('SIM_GATE_FLAGS') < html.indexOf('sim-auth-gate.js'));

    // ---- 5: the gate must never cost us the crawl
    ok(page.label + ' is still indexable',
        !/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html));
    ok(page.label + ' keeps its crawlable copy',
        html.length > 20000 && /<h1[\s>]/.test(html));
}

// ---- 3: the NFL page must not clobber the sitewide backend client
{
    const html = read('nfl-simulator/index.html');
    const inline = html.split('<script>').pop();
    ok('NFL page does not declare a global function api()',
        !/^\s*(?:async\s+)?function\s+api\s*\(/m.test(inline),
        'a top-level function api(){} overwrites window.api from backend-api.js');
    ok('NFL page still has its own namespaced API helper',
        /function\s+nflApi\s*\(/.test(inline));
    ok('NFL page loads backend-api.js (gate needs window.api)',
        /\/static\/js\/backend-api\.js/.test(html));
    ok('NFL page loads config.js before backend-api.js',
        html.indexOf('/static/js/config.js') > -1 &&
        html.indexOf('/static/js/config.js') < html.indexOf('/static/js/backend-api.js'));
}

// ---- 4: auth hand-off is relative-only and always asks for the resume
{
    const gate = read('static/js/sim-auth-gate.js');

    ok('gate sends signups to /register/ with a return path',
        /\/register\/\?return=' \+ encodeURIComponent\(rp\)/.test(gate));
    ok('gate sends logins to /login/ with a next path',
        /\/login\/\?next=' \+ encodeURIComponent\(rp\)/.test(gate));
    ok('return path is rejected unless it is a single-slash relative path',
        /\/\^\\\/\(\?!\\\/\)\//.test(gate) && /indexOf\(':\/\/'\)/.test(gate));
    ok('return path always carries the resume flag',
        /simResume=1/.test(gate));

    ['simulator_page_viewed', 'simulator_configured', 'simulator_run_clicked_logged_out',
        'simulator_signup_started', 'simulator_signup_completed', 'simulator_login_completed',
        'simulator_state_restored', 'simulator_simulation_completed',
        'simulator_first_simulation_completed', 'simulator_return_visit'
    ].forEach(ev => ok('funnel event ' + ev + ' is emitted', gate.indexOf(ev) !== -1));

    ok('gate never blocks the page itself, only the run',
        !/display\s*:\s*none/.test(gate) && /requireAuth/.test(gate));
}

// ---- adapters agree with the core on the storage contract
{
    const gate = read('static/js/sim-auth-gate.js');
    const mlb = read('static/js/mlb-simulator-gate.js');
    ok('MLB adapter registers with the core', /TMRSimGate\.register\(/.test(mlb));
    ok('MLB adapter supplies capture/restore/run',
        /captureState\s*:/.test(mlb) && /restoreState\s*:/.test(mlb) && /runNow\s*:/.test(mlb));
    ok('gate owns a single storage key', (gate.match(/tmr_sim_gate_pending/g) || []).length >= 1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('sim-auth-gate-wiring-test: ok');
