#!/usr/bin/env node
'use strict';

/**
 * The same seed must produce the same game, in the browser and in a harness.
 *
 * `simulate()` has always taken a seedSalt, and until 26 August 2026 it threw it
 * away: buildBoxScore opened with `var random = Math.random`. Two simulations of
 * one matchup with one seed produced two different games, so a saved or shared
 * box score could never be reproduced, and no test could compare the engine
 * against itself across runs.
 *
 * seededHash and seededRandom were already defined in the file and unused on
 * that path. This asserts they stay wired in.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED: that an unseeded call is repeatable. The
 * page asks for a fresh draw when the user presses Run Again, and that must keep
 * varying. A test that forced determinism everywhere would break the feature it
 * is meant to protect.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptPath = path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js');
const source = fs.readFileSync(scriptPath, 'utf8');

/** A fresh interpreter each time: this is the harness standing in for a reload. */
function loadSimulator() {
  const el = () => ({
    id: '', disabled: false, value: '', textContent: '', innerHTML: '', className: '',
    attributes: {}, listeners: {},
    style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, removeChild() {}, querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const ctx = {
    window: { URL: { createObjectURL() { return 'blob:t'; }, revokeObjectURL() {} } },
    document: {
      readyState: 'complete',
      getElementById() { return el(); },
      querySelector() { return el(); },
      querySelectorAll() { return []; },
      addEventListener() {},
      createElement() { return el(); },
      body: { appendChild() {}, removeChild() {} },
    },
    console: { info() {}, log() {}, warn() {}, error() {} },
    Math, Number, Date, Promise, JSON, String, Array, Object,
    isNaN, parseFloat, parseInt, setTimeout, clearTimeout,
    Blob: class {},
    navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    fetch: () => Promise.reject(new Error('offline test')),
    CONFIG: { api: { baseUrl: '' } },
  };
  ctx.window.document = ctx.document;
  vm.runInNewContext(source, ctx);
  return ctx.window.TMRMlbSimulator;
}

/**
 * A fingerprint deep enough that two different games cannot collide by accident:
 * the line score, both totals, and every batter's line.
 */
function fingerprint(result) {
  const box = result.boxScore;
  const side = (s) => [
    s.runs, s.hits, s.errors, (s.innings || []).join(','),
  ].join('|');
  const players = ['away', 'home'].map((k) => {
    const g = (box.players && box.players[k]) || {};
    const bat = (g.batters || []).map((r) => [r.name, r.ab, r.h, r.r, r.rbi, r.so].join(':')).join(';');
    const pit = (g.pitchers || []).map((r) => [r.name, r.outs, r.h, r.r, r.er, r.so].join(':')).join(';');
    return bat + '#' + pit;
  }).join('||');
  return side(box.away) + '/' + side(box.home) + '/' + players;
}

let failures = 0;
const check = (label, condition) => {
  if (condition) {
    process.stdout.write('  ok - ' + label + '\n');
  } else {
    failures += 1;
    process.stdout.write('  FAIL - ' + label + '\n');
  }
};

const A = loadSimulator();
const B = loadSimulator();
const away = A.localTeams.current[0];
const home = A.localTeams.current[1];
const awayB = B.localTeams.current[0];
const homeB = B.localTeams.current[1];

const first = A.simulate(away, home, {}, 'determinism-seed-1', false, null);
const again = A.simulate(away, home, {}, 'determinism-seed-1', false, null);
const other = A.simulate(away, home, {}, 'determinism-seed-2', false, null);
const fresh = B.simulate(awayB, homeB, {}, 'determinism-seed-1', false, null);

check('the same seed repeats exactly within one instance',
  fingerprint(first) === fingerprint(again));

// This is the one that matters: a separate interpreter, loaded from the same
// source, standing in for a different browser on a different day.
check('the same seed repeats exactly in a freshly loaded instance',
  fingerprint(first) === fingerprint(fresh));

check('a different seed produces a different game',
  fingerprint(first) !== fingerprint(other));

const unseededA = A.simulate(away, home, {}, null, false, null);
const unseededB = A.simulate(away, home, {}, null, false, null);
check('an unseeded run still varies, so Run Again keeps working',
  fingerprint(unseededA) !== fingerprint(unseededB));

// Reproducibility is worthless if the reproduced game is not a legal one.
check('the reproduced box score still reconciles',
  first.boxScore.away.runs === (first.boxScore.away.innings || []).reduce((s, x) => s + Number(x || 0), 0)
  && first.boxScore.home.runs === (first.boxScore.home.innings || []).reduce((s, x) => s + Number(x || 0), 0));

process.stdout.write('\nmlb-simulator-determinism-test: '
  + (failures ? failures + ' FAILED' : '5 passed') + '\n');
process.exit(failures ? 1 : 0);
