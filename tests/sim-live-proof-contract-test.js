#!/usr/bin/env node
// SIM_PROOF_FOLDS_20261105: three workflows sat red with every page working, and the report
// said "Deployment allowed: YES" while the job failed. This holds the reasons shut.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ok  ' + name); };
const body = (src, fn) => {
  const start = src.indexOf('async function ' + fn + '(');
  assert.ok(start >= 0, fn + ' missing');
  const end = src.indexOf('\nasync function ', start + 1);
  return src.slice(start, end < 0 ? undefined : end);
};

const proof = read('scripts/tools-live-browser-proof.js');
const FOLDED = ['#awayTeamSelect', '#homeTeamSelect', '#simulationCountSelect'];

ok('the page keeps these selects in a closed fold, so a proof cannot click them', () => {
  const bc = read('static/js/tmr-sim-broadcast.js');
  assert.ok(/fold\('bc-set'/.test(bc) && /set\.body\.appendChild\(control\)/.test(bc));
});
for (const fn of ['verifyMlbSimulatorGate', 'verifyMlbSimulator']) {
  ok(fn + ' never drives a folded select as if it were visible', () => {
    const src = body(proof, fn);
    for (const id of FOLDED) {
      assert.ok(!src.includes("selectByText(page, '" + id), id + ' via selectByText');
      assert.ok(!src.includes("selectOption('" + id), id + ' via selectOption');
    }
  });
}
ok('result text is read with the folds open', () => {
  const src = body(proof, 'verifyMlbSimulator');
  const open = src.indexOf('openAllFolds(page)');
  const readAt = src.indexOf("locator('body').innerText()");
  assert.ok(open >= 0 && open < readAt, 'innerText skips closed details');
});
ok('legibility test does not click a folded select', () => {
  const src = read('tests/mlb-simulator-legibility-test.cjs');
  for (const id of FOLDED) assert.ok(!src.includes("selectOption('" + id), id);
});
ok('trend spotter proof tolerates the API not serving ROI', () => {
  const src = read('tests/trendspotter-live-verification.spec.js');
  assert.ok(!/summary\.roi !== null/.test(src), 'undefined !== null gives a NaN failure');
});

const { runCheck } = require(path.join(root, 'scripts', 'verify-regression.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmr-reg-'));
const write = (n, s) => { const f = path.join(tmp, n); fs.writeFileSync(f, s); return f; };
const log = console.log; console.log = () => {};
const late = runCheck('late', 'node', [write('late.js', 'setTimeout(() => process.exit(1), 3200);')]);
const fine = runCheck('fine', 'node', [write('fine.js', 'setTimeout(() => process.exit(0), 100);')]);
console.log = log;
ok('a check that fails after 3 s is reported failed, not passed', () => assert.strictEqual(late.status, 'failed'));
ok('a passing check still passes', () => assert.strictEqual(fine.status, 'passed'));
fs.rmSync(tmp, { recursive: true, force: true });

console.log(passed + ' passed, 0 failed');
