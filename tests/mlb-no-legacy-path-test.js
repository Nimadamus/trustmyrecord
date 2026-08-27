#!/usr/bin/env node
'use strict';

/**
 * mlb-no-legacy-path-test.js -- the Poisson box score must stay gone.
 *
 * The MLB simulator used to build its box score by drawing two final scores from
 * a Poisson distribution and then inventing plausible-looking player lines to sit
 * underneath them. That path (buildBoxScoreLegacy, on controlledFinalScore) was
 * replaced by a real plate-appearance simulation, and by 2026 nothing called it.
 *
 * It was still dangerous, for one specific reason: its first line read
 *     var random = Math.random;
 * It ignored the seed. Reconnecting it -- a merge, a revert, a well-meant
 * "restore the fast path" -- would have silently replaced reproducible simulation
 * with unreproducible draws, and the output would still have looked like a box
 * score. Nothing would have failed.
 *
 * So this fails instead. Deleted 27 Aug 2026; recoverable from git at b26ad22a1.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js');
const src = fs.readFileSync(ENGINE, 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); process.stdout.write('  PASS  ' + name + '\n'); }
  catch (e) { failures += 1; process.stdout.write('  FAIL  ' + name + '\n        ' + e.message + '\n'); }
}

process.stdout.write('\n  MLB LEGACY PATH\n\n');

check('no legacy box-score builder is defined', () => {
  assert.ok(!/function\s+buildBoxScoreLegacy\s*\(/.test(src),
    'buildBoxScoreLegacy is back. It ignores the seed; production must not be able to reach it.');
});

check('no Poisson final-score generator is defined', () => {
  assert.ok(!/function\s+controlledFinalScore\s*\(/.test(src),
    'controlledFinalScore is back. A final score drawn from a distribution is not a simulated game.');
  assert.ok(!/function\s+poisson\s*\(/.test(src),
    'the Poisson helper is back; nothing in the plate-appearance engine needs it.');
});

check('no run-distributor invents a line score', () => {
  // The line score must be the sum of what happened in each half-inning, not a
  // total sprinkled across nine boxes after the fact.
  assert.ok(!/function\s+distributeRuns\s*\(/.test(src));
  assert.ok(!/function\s+hitTotalForRuns\s*\(/.test(src),
    'hits must come from the plate appearances, not from a formula on runs');
});

check('the only exported box-score builder is the event one', () => {
  const exported = (src.match(/^\s*(\w+)\s*:\s*\1\s*,?$/gm) || []).join(' ');
  assert.ok(!/buildBoxScoreLegacy/.test(exported),
    'the legacy builder must not be reachable through the _engine seam either');
});

/**
 * The behavioural half. A Poisson box score cannot reconcile: its line score is
 * distributed independently of its player lines. A simulated one always can.
 */
function loadEngine() {
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
    document: { readyState: 'complete', getElementById: el, querySelector: el,
      querySelectorAll() { return []; }, addEventListener() {}, createElement: el,
      body: { appendChild() {}, removeChild() {} } },
    console: { info() {}, log() {}, warn() {}, error() {} },
    Math, Number, Date, Promise, JSON, String, Array, Object,
    isNaN, parseFloat, parseInt, setTimeout, clearTimeout, Blob: class {},
    navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    fetch: () => Promise.reject(new Error('offline test')),
    CONFIG: { api: { baseUrl: '' } },
  };
  ctx.window.document = ctx.document;
  ctx.self = ctx.window;
  vm.runInNewContext(src, ctx);
  return ctx.window.TMRMlbSimulator;
}

const sim = loadEngine();
const teams = sim.localTeams.current;

check('every line score reconciles with its own runs', () => {
  for (let i = 0; i < 40; i += 1) {
    const r = sim.simulate(teams[i % teams.length], teams[(i + 7) % teams.length], {},
      'legacy-guard-' + i, false, null);
    for (const side of ['away', 'home']) {
      const line = r.boxScore[side];
      const summed = (line.innings || []).reduce((t, x) => t + Number(x || 0), 0);
      assert.strictEqual(summed, line.runs,
        'game ' + i + ' ' + side + ': innings sum to ' + summed + ' but the line says ' + line.runs);
    }
  }
});

check('the same seed reproduces the same game', () => {
  // The whole reason the legacy path was a hazard. If this ever fails, something
  // in the simulation is drawing from Math.random again.
  const a = sim.simulate(teams[0], teams[1], {}, 'legacy-guard-seed', false, null);
  const b = sim.simulate(teams[0], teams[1], {}, 'legacy-guard-seed', false, null);
  assert.strictEqual(
    [a.boxScore.away.runs, a.boxScore.home.runs, a.boxScore.away.hits, a.boxScore.home.hits, Number(a.homeWin).toFixed(6)].join('|'),
    [b.boxScore.away.runs, b.boxScore.home.runs, b.boxScore.away.hits, b.boxScore.home.hits, Number(b.homeWin).toFixed(6)].join('|'),
    'two runs of the same seed produced different games');
});

process.stdout.write('\n');
if (failures) { process.stdout.write('  ' + failures + ' failed\n\n'); process.exit(1); }
process.stdout.write('  The legacy path is gone and cannot be reached.\n\n');
