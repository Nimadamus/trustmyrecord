#!/usr/bin/env node
'use strict';

/**
 * mlb-market-mode-test.js -- the sportsbook must be visible or absent, never
 * quietly mixed in.
 *
 * Before MARKET_MODE_20260827 the page blended 15% of the no-vig moneyline into
 * its win probability and 22% of the posted total into its run environment
 * whenever a board happened to be available, and said nothing about it. A
 * visitor reading "TMR's simulation" was reading a number that was partly the
 * book's, and any accuracy claim made from it was partly a claim about the book.
 *
 * These assertions are the guard rail:
 *
 *   1. In pure mode, handing the engine a full board changes NOTHING. Not the
 *      win probability, not the projection, not the box score.
 *   2. In market mode the board does move the number, and the result reports
 *      which book and which snapshot moved it.
 *   3. Market mode with no board is reported as what it is -- a pure run --
 *      rather than being labelled market-informed on the strength of a setting.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js');

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
  vm.runInNewContext(fs.readFileSync(ENGINE, 'utf8'), ctx);
  return ctx.window.TMRMlbSimulator;
}

/** A board that is deliberately far from where the model will land. */
const BOARD = {
  odds: {
    book: 'Test Book',
    updatedAt: '2026-08-27T17:05:00Z',
    awayPrice: -400,
    homePrice: 320,
    total: 12.5,
  },
};

const SEED = 'market-mode-test';

function run(sim, mode, context) {
  sim.state.marketMode = mode;
  const teams = sim.localTeams.current;
  const r = sim.simulate(teams[0], teams[1], context, SEED, false, null);
  return {
    homeWin: Number(r.homeWin),
    away: Number(r.projectedAwayScore),
    home: Number(r.projectedHomeScore),
    box: [r.boxScore.away.runs, r.boxScore.home.runs, r.boxScore.away.hits, r.boxScore.home.hits].join('|'),
    influence: r.marketInfluence,
    label: r.modelInputMode,
    factors: (r.liveFactors || []).join(' || '),
  };
}

let failures = 0;
function check(name, fn) {
  try { fn(); process.stdout.write('  PASS  ' + name + '\n'); }
  catch (e) { failures += 1; process.stdout.write('  FAIL  ' + name + '\n        ' + e.message + '\n'); }
}

process.stdout.write('\n  MLB MARKET MODE\n\n');

const sim = loadEngine();

const pureNoBoard = run(sim, 'pure', {});
const pureWithBoard = run(sim, 'pure', BOARD);
const marketWithBoard = run(sim, 'market', BOARD);
const marketNoBoard = run(sim, 'market', {});

check('pure mode ignores a board completely', () => {
  assert.strictEqual(pureWithBoard.homeWin, pureNoBoard.homeWin,
    'win probability moved: ' + pureNoBoard.homeWin + ' -> ' + pureWithBoard.homeWin);
  assert.strictEqual(pureWithBoard.away, pureNoBoard.away, 'projected away runs moved');
  assert.strictEqual(pureWithBoard.home, pureNoBoard.home, 'projected home runs moved');
  assert.strictEqual(pureWithBoard.box, pureNoBoard.box, 'box score moved');
});

check('pure mode says so and claims no market influence', () => {
  assert.strictEqual(pureWithBoard.label, 'Pure TMR simulation');
  assert.strictEqual(pureWithBoard.influence.mode, 'pure');
  assert.strictEqual(pureWithBoard.influence.appliedToWinProbability, false);
  assert.strictEqual(pureWithBoard.influence.appliedToRunEnvironment, false);
  assert.ok(!/MARKET-INFORMED/.test(pureWithBoard.factors),
    'a pure run must not carry a market-informed line');
});

check('market mode actually moves the number', () => {
  // Through the run environment, which is the only channel that survives. The
  // posted total feeds the anchor that builds the plate-appearance inputs, so it
  // moves the projection, the box score AND the win probability that is sampled
  // from them.
  assert.notStrictEqual(marketWithBoard.box, pureNoBoard.box,
    'a 12.5 total left the simulated game identical');
  assert.notStrictEqual(marketWithBoard.away + marketWithBoard.home,
    pureNoBoard.away + pureNoBoard.home, 'the projected total did not move');
});

check('the moneyline is compared, never blended', () => {
  // DEAD_MONEYLINE_BLEND_20260827. The old 15% blend was overwritten by the
  // Monte Carlo before anything read it. Nothing may claim otherwise.
  assert.strictEqual(marketWithBoard.influence.appliedToWinProbability, false);
  assert.strictEqual(marketWithBoard.influence.winProbabilityWeight, 0);
  assert.strictEqual(marketWithBoard.influence.moneylineShownForComparison, true);
  assert.ok(!/blended into this win probability/.test(marketWithBoard.factors),
    'the page must not claim a moneyline blend that does not happen');
});

check('market mode reports the book and the snapshot', () => {
  assert.strictEqual(marketWithBoard.label, 'Market-informed');
  assert.strictEqual(marketWithBoard.influence.book, 'Test Book');
  assert.strictEqual(marketWithBoard.influence.snapshotAt, '2026-08-27T17:05:00Z');
  assert.ok(/MARKET-INFORMED/.test(marketWithBoard.factors),
    'the visitor-facing factor list must name the blend');
  assert.ok(/2026-08-27T17:05:00Z/.test(marketWithBoard.factors),
    'the snapshot timestamp must reach the visitor');
});

check('the posted total reaches the run environment and is disclosed', () => {
  assert.strictEqual(marketWithBoard.influence.appliedToRunEnvironment, true);
  assert.strictEqual(marketWithBoard.influence.runEnvironmentWeight, 0.22);
  assert.ok(/posted total/.test(marketWithBoard.factors));
});

check('market mode with no board is reported as a pure run', () => {
  assert.strictEqual(marketNoBoard.influence.appliedToRunEnvironment, false);
  assert.strictEqual(marketNoBoard.influence.moneylineShownForComparison, false);
  assert.strictEqual(marketNoBoard.homeWin, pureNoBoard.homeWin,
    'with no board, market mode must reproduce the pure result exactly');
});

check('the shipped default is pure', () => {
  const fresh = loadEngine();
  assert.strictEqual(fresh.state.marketMode, 'pure',
    'the default mode decides what an ordinary visitor is shown');
});

process.stdout.write('\n');
if (failures) { process.stdout.write('  ' + failures + ' failed\n\n'); process.exit(1); }
process.stdout.write('  All market-mode assertions hold.\n\n');
