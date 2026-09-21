/**
 * Simulator post-run Take the {team} buttons.
 *
 * One tap writes tmr_sim_pick_intent and goes to /sportsbook/?simpick=1.
 * Nothing here submits a pick.
 *
 *   node tests/sim-take-sides-test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const nfl = read('nfl-simulator/index.html');
const mlb = read('static/js/mlb-sim-landing.js');
const onboarding = read('static/js/first-pick-onboarding.js');
const nudge = read('static/js/pick-progress-nudge.js');
const prefill = read('static/js/sim-pick-prefill.js');

assert.ok(/function simTakeLabel/.test(nfl), 'NFL has Take the {team} labels');
assert.ok(/data-sim-take-team/.test(nfl), 'NFL buttons carry the take-team marker');
assert.ok(/\/sportsbook\/\?simpick=1/.test(nfl), 'NFL still uses the simpick handoff');
assert.ok(!/id="simPickCta"/.test(nfl), 'the extra confirm button is gone on NFL');
assert.ok(!/method:\s*'POST'/.test(nfl.slice(nfl.indexOf('function simGoPick'), nfl.indexOf('function simRenderConversion'))),
  'NFL take path never POSTs');

assert.ok(/function takeTheLabel/.test(mlb), 'MLB has Take the {team} labels');
assert.ok(/data-sim-take-team/.test(mlb), 'MLB buttons carry the take-team marker');
assert.ok(/function onTakeTeam/.test(mlb), 'MLB one-tap handler exists');
assert.ok(!/simv2PickCta/.test(mlb), 'the extra confirm button is gone on MLB');
assert.ok(/\/sportsbook\/\?simpick=1/.test(mlb), 'MLB still uses the simpick handoff');
assert.ok(!/method:\s*'POST'/.test(mlb.slice(mlb.indexOf('function onTakeTeam'), mlb.indexOf('function onTakeTeam') + 1200)),
  'MLB take path never POSTs');

assert.ok(/\[data-sim-take-team\]/.test(onboarding), 'zero-pick strip stands down for take buttons');
assert.ok(/\[data-sim-take-team\]/.test(nudge), 'pick-two nudge stands down for take buttons');
assert.ok(/tmr_sim_pick_intent/.test(prefill) && /simpick/.test(prefill), 'sportsbook prefill still owns the handoff');
assert.ok(!/method:\s*'POST'/.test(prefill), 'prefill still never submits');

function loadNflHelpers() {
  const vm = require('vm');
  const start = nfl.indexOf('function simTakeLabel');
  const end = nfl.indexOf('function simRenderConversion');
  const snippet = nfl.slice(start, end);
  const store = {};
  const ctx = {
    Date,
    JSON,
    localStorage: {
      setItem: (k, v) => { store[k] = String(v); },
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    },
  };
  ctx.window = ctx;
  ctx.window.TMRSimGate = { track: function () {} };
  ctx.window.location = {
    _href: 'https://trustmyrecord.com/nfl-simulator/',
    set href(v) { this._href = v; },
    get href() { return this._href; },
  };
  vm.runInNewContext("const SIM_PICK_INTENT_KEY='tmr_sim_pick_intent';\n" + snippet, ctx);
  ctx._store = store;
  return ctx;
}

const ctx = loadNflHelpers();
assert.strictEqual(ctx.simTakeLabel('New York Giants'), 'Take the Giants');
assert.strictEqual(ctx.simTakeLabel('Los Angeles Rams'), 'Take the Rams');
assert.strictEqual(ctx.simTakeLabel('San Francisco 49ers'), 'Take the 49ers');
assert.strictEqual(ctx.simTakeLabel('Boston Red Sox'), 'Take the Red Sox');

ctx.simGoPick('New York Giants', { away: 'New York Giants', home: 'Los Angeles Rams' });
const intent = JSON.parse(ctx._store.tmr_sim_pick_intent);
assert.strictEqual(intent.pick_team, 'New York Giants');
assert.strictEqual(intent.away_team_name, 'New York Giants');
assert.strictEqual(intent.home_team_name, 'Los Angeles Rams');
assert.strictEqual(intent.sport, 'NFL');
assert.strictEqual(intent.source, 'nfl-simulator');
assert.strictEqual(ctx.window.location.href, '/sportsbook/?simpick=1');

console.log('sim-take-sides-test: ok');
