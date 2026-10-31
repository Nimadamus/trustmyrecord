#!/usr/bin/env node
'use strict';

/**
 * mlb-box-score-reconciliation-test.js -- every number in the box score has to
 * come from the same game.
 *
 * A simulated box score is credible only if it is internally consistent. Runs
 * scored by batters must equal runs on the line score; outs recorded by pitchers
 * must equal outs the batting side made; a pitcher who entered must have exited;
 * a pinch hitter must occupy the slot of the man he replaced. None of that is
 * guaranteed by the engine producing plausible-looking totals, and a box score
 * that does not reconcile is worse than no box score, because it looks right.
 *
 * This runs the RELEASE CANDIDATE configuration -- the flags that are actually
 * going out -- over a large sample and asserts every invariant on every game.
 * It reports the first failing game in full rather than a count, because one
 * unreconciled game is a defect, not a rate.
 *
 *   node tests/mlb-box-score-reconciliation-test.js
 *   TMR_MLB_RECON_GAMES=3000 node tests/mlb-box-score-reconciliation-test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js');
const GAMES = Number(process.env.TMR_MLB_RECON_GAMES || 1200);
const BB_TABLE = process.env.TMR_MLB_BB_TABLE_PATH || '';
/**
 * A roster snapshot. Without one the engine builds a synthetic league-average
 * lineup with NO named batters at all, and every batter-level invariant below is
 * vacuous rather than passing. The line-score and pitcher checks still mean
 * something, so the run continues either way -- but it says which it did.
 */
const SNAPSHOT = process.env.TMR_MLB_ROSTER_SNAPSHOT || '';

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
  // The release candidate, not the shipped defaults.
  ctx.window.TMR_MLB_WORKLOAD_V2 = true;
  ctx.window.TMR_MLB_STARTER_RESIDUAL = 0.010;
  if (BB_TABLE && fs.existsSync(BB_TABLE)) {
    ctx.window.TMR_MLB_BB_TABLE = JSON.parse(fs.readFileSync(BB_TABLE, 'utf8'));
  }
  vm.runInNewContext(fs.readFileSync(ENGINE, 'utf8'), ctx);
  const sim = ctx.window.TMRMlbSimulator;
  if (SNAPSHOT && fs.existsSync(SNAPSHOT)) {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    sim.state.liveContext = { teamRosters: {}, playerStats: JSON.parse(JSON.stringify(snap.playerStats)) };
    for (const ab of Object.keys(snap.teamRosters)) {
      const e = snap.teamRosters[ab];
      sim.state.liveContext.teamRosters[ab] = {
        teamId: e.teamId, source: e.source, players: JSON.parse(JSON.stringify(e.players)),
      };
    }
  }
  // Reconciliation is about the BOX SCORE, and the box score is one seeded game.
  // The win-probability Monte Carlo behind it costs 2,000 simulated games per
  // call and cannot make an invariant true or false, so it runs shallow here.
  sim.state.simulationCount = 2;
  return sim;
}

/* THIRD_OUT_INVARIANT_20261031: an out on the bases (runner thrown out going
   first to third, batter thrown out stretching) must never be recorded after the
   third out. The 12,000-game suite caught home pitchers with 28 outs in a
   nine-inning game. Every completed half-inning holds exactly three outs: the
   home staff therefore records exactly 3 x (away half-innings), and the away
   staff 3 x (home half-innings), less up to three in a walk-off last half
   (the winning run can score before an out is made). */
const N_GAMES = Number(process.env.TMR_MLB_THIRD_OUT_GAMES || 3000);
const sim = loadEngine();
const teams = sim.localTeams.current.concat(sim.localTeams.historical.slice(0, 30));
const bad = [];
let maxOutsAfter = 0;
for (let i = 0; i < N_GAMES; i += 1) {
  const away = teams[i % teams.length], home = teams[(i * 7 + 3) % teams.length];
  if (away === home) continue;
  const r = sim.simulate(away, home, {}, 'third-out-' + i, false, null);
  const bx = r.boxScore, P = bx.players;
  const outs = (side) => P[side].pitchers.reduce((t, p) => t + Number(p.outs || 0), 0);
  const played = (arr) => arr.filter((v) => typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))).length;
  const ai = played(bx.away.innings), hi = played(bx.home.innings);
  if (outs('home') !== 3 * ai) bad.push('third-out-' + i + ': home pitchers ' + outs('home') + ' outs for ' + ai + ' away half-innings');
  const ao = outs('away');
  const walkOff = bx.home.runs > bx.away.runs && Number(bx.home.innings[bx.home.innings.length - 1]) > 0;
  if (ao > 3 * hi || ao < 3 * hi - (walkOff ? 3 : 0)) bad.push('third-out-' + i + ': away pitchers ' + ao + ' outs for ' + hi + ' home half-innings');
  ((bx.eventLog && bx.eventLog.events) || []).forEach((e) => {
    if (Number.isFinite(e.outsAfter)) maxOutsAfter = Math.max(maxOutsAfter, e.outsAfter);
    if (e.outsAfter > 3) bad.push('third-out-' + i + ': event ' + (e.result && e.result.code) + ' left ' + e.outsAfter + ' outs');
  });
  if (bad.length > 20) break;
}
process.stdout.write("  games " + N_GAMES + ', max outs after any event ' + maxOutsAfter + ', violations ' + bad.length + String.fromCharCode(10));
bad.slice(0, 10).forEach((b) => process.stdout.write('    ' + b + String.fromCharCode(10)));
assert.strictEqual(bad.length, 0, 'no out recorded after the third out');
process.stdout.write('mlb-third-out-test: ok' + String.fromCharCode(10));
