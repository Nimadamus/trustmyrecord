#!/usr/bin/env node
'use strict';

/**
 * mlb-feature-flag-isolation-test.js -- a disabled feature must not exist.
 *
 * Two defects were shipped-ready before the equivalence gate caught them, and
 * neither was visible to any other test, because every other test ran with the
 * flags ON.
 *
 *   1. The pinch-hit block was wrapped in the feature flag, which SKIPPED the
 *      shipped rule entirely, including its random() draw. Removing a draw
 *      shifts every later draw in the game. With the flag off, not one box score
 *      in thirty-seven matched the baseline. Nothing threw; the games were
 *      simply different games.
 *
 *   2. RELIEF_SHARE was never gated at all. With a three-arm staff it usually
 *      resolves to the same index, which is exactly why it went unnoticed.
 *
 * The lesson is narrow and worth encoding: it is not enough for a flagged
 * feature to be skipped. The code path with the flag off must consume the same
 * random numbers, in the same order, as the build it claims to leave alone.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js');
const src = fs.readFileSync(ENGINE, 'utf8');

function loadEngine(flags) {
  const el = () => ({
    id: '', disabled: false, value: '', textContent: '', innerHTML: '', className: '',
    attributes: {}, listeners: {}, style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, removeChild() {}, querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const ctx = {
    window: { URL: { createObjectURL() { return 'b'; }, revokeObjectURL() {} } },
    document: {
      readyState: 'complete', getElementById: el, querySelector: el,
      querySelectorAll() { return []; }, addEventListener() {}, createElement: el,
      body: { appendChild() {}, removeChild() {} },
    },
    console: { info() {}, log() {}, warn() {}, error() {} },
    Math, Number, Date, Promise, JSON, String, Array, Object,
    isNaN, parseFloat, parseInt, setTimeout, clearTimeout, Blob: class {},
    navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    fetch: () => Promise.reject(new Error('offline test')),
    CONFIG: { api: { baseUrl: '' } },
  };
  ctx.window.document = ctx.document;
  ctx.self = ctx.window;
  Object.assign(ctx.window, flags || {});
  vm.runInNewContext(src, ctx);
  return ctx.window.TMRMlbSimulator;
}

/** Deep enough that any change in the random sequence shows up. */
function fingerprint(r) {
  const b = r.boxScore;
  const side = (s) => [s.runs, s.hits, s.errors, (s.innings || []).join(',')].join('|');
  const grp = (k) => {
    const g = b.players[k] || {};
    return (g.batters || []).map((x) => [x.name, x.pa, x.ab, x.h, x.r, x.rbi, x.so, x.bb, x.hr, x.sf, x.gidp, x.sb].join(':')).join(';')
      + '#' + (g.pitchers || []).map((x) => [x.name, x.outs, x.h, x.r, x.er, x.so, x.bb, x.hr, x.pitches].join(':')).join(';');
  };
  return [side(b.away), side(b.home), grp('away'), grp('home')].join('/');
}

function play(sim, seed) {
  const t = sim.localTeams.current;
  return fingerprint(sim.simulate(t[0], t[1], {}, seed, false, null));
}

let failures = 0;
function check(name, fn) {
  try { fn(); process.stdout.write('  PASS  ' + name + '\n'); }
  catch (e) { failures += 1; process.stdout.write('  FAIL  ' + name + '\n        ' + String(e.message).slice(0, 260) + '\n'); }
}

process.stdout.write('\n  MLB FEATURE FLAG ISOLATION\n\n');

const SEEDS = ['flag-iso-1', 'flag-iso-2', 'flag-iso-3', 'flag-iso-4', 'flag-iso-5'];
const baseline = SEEDS.map((s) => play(loadEngine(null), s));

check('no flag set reproduces itself exactly', () => {
  const again = SEEDS.map((s) => play(loadEngine(null), s));
  assert.deepStrictEqual(again, baseline, 'the flagless engine is not deterministic');
});

/**
 * Each flag, on its own, must leave the flagless path untouched when it is off.
 * Setting a flag to a falsy value is the same as not setting it.
 */
const FALSY = [
  ['TMR_MLB_WORKLOAD_V2', false],
  ['TMR_MLB_STARTER_RESIDUAL', 0],
  ['TMR_MLB_BB_TABLE', null],
  ['TMR_MLB_PARK_FACTORS', null],
  ['TMR_MLB_BATTER_PRIOR_PA', 0],
  ['TMR_MLB_PITCHER_QUALITY', null],
  ['TMR_MLB_STARTER_CHANNELS', ''],
];
for (const [name, off] of FALSY) {
  check(name + ' set falsy is identical to unset', () => {
    const flags = {};
    flags[name] = off;
    const got = SEEDS.map((s) => play(loadEngine(flags), s));
    assert.deepStrictEqual(got, baseline, name + ' leaks into the default path when off');
  });
}

/**
 * The pinch-hit defect specifically: the shipped rule draws a random number
 * whenever it evaluates, and the flag-off path must still draw it.
 */
check('the workload flag off preserves the shipped pinch-hit draw', () => {
  const hasFlagOffBranch = src.indexOf('!workloadV2()') !== -1
    && src.indexOf("'strategic move'") !== -1;
  assert.ok(hasFlagOffBranch,
    'the original pinch-hit rule is no longer present as the flag-off branch. '
    + 'Skipping it removes a random draw and changes every later play.');
});

/** The RELIEF_SHARE defect specifically: it must read the flag. */
check('RELIEF_SHARE is controlled by its flag', () => {
  const m = /var RELIEF_SHARE = ([^\n;]+);/.exec(src);
  assert.ok(m, 'RELIEF_SHARE not found');
  assert.ok(m[1].indexOf('workloadV2()') !== -1,
    'RELIEF_SHARE does not consult the feature flag: ' + m[1]);
});

/** A flag that changes nothing when enabled is a lie about what shipped. */
const ON = [
  ['TMR_MLB_WORKLOAD_V2', { TMR_MLB_WORKLOAD_V2: true }],
  ['TMR_MLB_STARTER_RESIDUAL', { TMR_MLB_STARTER_RESIDUAL: 0.010 }],
];
for (const [name, flags] of ON) {
  check(name + ' turned on changes the simulation', () => {
    const got = SEEDS.map((s) => play(loadEngine(flags), s));
    assert.notDeepStrictEqual(got, baseline, name + ' is enabled but changes nothing');
  });
}

/**
 * Direction, not just difference. The residual is a signed quantity and a sign
 * error would still "change the simulation" while making an ace help the side
 * he is pitching against.
 */
check('a better starter lowers the runs projected against him', () => {
  const sim = loadEngine({ TMR_MLB_STARTER_RESIDUAL: 0.010 });
  const seam = sim._engine;
  assert.ok(seam && typeof seam.starterResidualRunAdjustment === 'function',
    'starterResidualRunAdjustment is not exposed on the engine seam');
  const team = { startingPitching: 100 };
  const ace = { quality: 125, era: 2.4 };
  const scrub = { quality: 80, era: 6.1 };
  const par = { quality: 100, era: 4.3 };
  const aceAdj = seam.starterResidualRunAdjustment(ace, team);
  const scrubAdj = seam.starterResidualRunAdjustment(scrub, team);
  const parAdj = seam.starterResidualRunAdjustment(par, team);
  assert.ok(aceAdj < 0, 'an ace must REDUCE the opponent run anchor, got ' + aceAdj);
  assert.ok(scrubAdj > 0, 'a replacement starter must RAISE it, got ' + scrubAdj);
  assert.ok(Math.abs(parAdj) < 1e-9,
    'a league-average starter on a league-average rotation must be worth nothing, got ' + parAdj);
  assert.ok(Math.abs(aceAdj) < 0.65 && Math.abs(scrubAdj) < 0.65,
    'the residual is unbounded enough to swing a game on one man');
});

process.stdout.write('\n');
if (failures) { process.stdout.write('  ' + failures + ' failed\n\n'); process.exit(1); }
process.stdout.write('  Every flag is isolated; nothing disabled reaches production.\n\n');
