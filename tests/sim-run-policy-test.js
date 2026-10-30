/* =============================================================================
   SIM RUN POLICY: ONE RULE, ONE WORDING, EVERY PAGE        SIM_RUN_POLICY_20261030
   -----------------------------------------------------------------------------
   Audit 2026-10-30: simulator pages contradicted each other ("free with no
   account", "your first simulation need no account", "needs a free account")
   and none said an extra run costs 5 TMR. The copy now comes from
   scripts/sim-run-policy.js. This fails when:
     1. any listed page's FAQ answer (visible or JSON-LD) or the runtime block in
        sim-auth-gate.js differs from the policy (run the stamp script);
     2. any simulator page or builder still carries a contradicting phrase;
     3. a listed page does not disclose the 5 TMR price;
     4. the policy price disagrees with the gate or, when the backend checkout
        sits next to this one, with services/tmrCoin.js SIMULATOR_RUN_COST;
     5. the season / playoff builders stop taking their answer from the policy.
   Run: node tests/sim-run-policy-test.js   (also a bake gate)
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const P = require('../scripts/sim-run-policy.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok  ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

// 1. Everything stamped is current. run() only writes outside --check, so
// call it in check mode by temporarily flagging argv.
process.argv.push('--check');
const { drift, broken } = (function () {
    // run() writes when not CHECK; CHECK is read at module load, so re-evaluate.
    delete require.cache[require.resolve('../scripts/stamp-sim-run-policy.js')];
    return require('../scripts/stamp-sim-run-policy.js').run();
})();
ok('1. every policy FAQ answer and the runtime gate block are in sync', !drift.length && !broken.length,
    drift.concat(broken).join('; ') + ' (run: node scripts/stamp-sim-run-policy.js)');

// 2. No contradicting copy on any simulator page or builder.
const SIM_FILES = P.PAGES.map((p) => p[0]).concat([
    'mlb-simulator/index.html', 'mlb-playoff-odds/index.html',
    'scripts/build_league_sim_pages.js', 'scripts/build_nfl_season_page.js', 'scripts/build_mlb_odds_page.js',
    'static/js/sim-auth-gate.js', 'static/js/sim-run-gate.js'
]).filter((f) => fs.existsSync(path.join(ROOT, f)));
for (const f of SIM_FILES) {
    const src = read(f);
    const hit = P.BANNED.find((re) => re.test(src));
    ok('2. no contradicting free run copy in ' + f, !hit, hit && String(hit));
}

// 3. Every listed page discloses the price, in the FAQ answer itself.
for (const [file, q, a] of P.PAGES) {
    ok('3. ' + file + ' says extra runs cost ' + P.POLICY.extraRunCostTmr + ' TMR',
        a.indexOf(P.POLICY.extraRunCostTmr + ' TMR') !== -1 && read(file).indexOf(P.POLICY.extraRunCostTmr + ' TMR') !== -1);
}
ok('3. published copy uses no dashes', !/[–—]| - /.test(P.BODY + P.SHORT + P.PAGES.map((p) => p[2]).join(' ')));

// 4. One price everywhere.
const gate = read('static/js/sim-auth-gate.js');
const m = gate.match(/var SIM_RUN_POLICY = (\{[^\n]*\});/);
let runtime = null;
try { runtime = m && vm.runInNewContext('(' + m[1] + ')'); } catch (e) { runtime = null; }
ok('4. the runtime gate reads the policy price', runtime && runtime.extraRunCostTmr === P.POLICY.extraRunCostTmr);
ok('4. the gate meter uses the policy price', /var METER_COST = SIM_RUN_POLICY\.extraRunCostTmr/.test(gate));
const beCandidates = [path.join(ROOT, '..', 'trustmyrecord-backend', 'services', 'tmrCoin.js'),
    path.join(ROOT, '..', 'be-gate', 'services', 'tmrCoin.js')];
const be = beCandidates.find((p) => fs.existsSync(p));
if (be) {
    const bm = fs.readFileSync(be, 'utf8').match(/const SIMULATOR_RUN_COST = (\d+);/);
    ok('4. the backend price equals the policy price', bm && Number(bm[1]) === P.POLICY.extraRunCostTmr, bm && bm[1]);
} else {
    console.log('  skip backend price check (no backend checkout beside this one)');
}

// 5. Builders take their answer from the policy, not their own sentence.
ok('5. league builder requires the policy', /require\('\.\/sim-run-policy\.js'\)/.test(read('scripts/build_league_sim_pages.js'))
    && (read('scripts/build_league_sim_pages.js').match(/RUN_POLICY\.faqAnswer\(/g) || []).length >= 3);
ok('5. NFL season builder requires the policy', /RUN_POLICY\.faqAnswer\(RUN_POLICY\.READ_FREE_SEASON\)/.test(read('scripts/build_nfl_season_page.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
