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

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Every invariant, checked on one game. Returns a list of violations. */
function reconcile(r, seed) {
  const bad = [];
  const box = r && r.boxScore;
  if (!box) return ['no box score produced'];

  for (const side of ['away', 'home']) {
    const line = box[side];
    const grp = box.players[side] || {};
    const batters = grp.batters || [];
    const pitchers = grp.pitchers || [];
    const opp = box[side === 'away' ? 'home' : 'away'];
    const oppGrp = box.players[side === 'away' ? 'home' : 'away'] || {};
    const oppBatters = oppGrp.batters || [];

    // 1. The line score is the game.
    const inningSum = (line.innings || []).reduce((t, x) => t + n(x), 0);
    if (inningSum !== n(line.runs)) {
      bad.push(side + ': innings sum to ' + inningSum + ' but the line says ' + n(line.runs));
    }

    // 2. Batters account for the team.
    const batRuns = batters.reduce((t, b) => t + n(b.r), 0);
    if (HAVE_LINEUPS && batRuns !== n(line.runs)) {
      bad.push(side + ': batters scored ' + batRuns + ' but the line says ' + n(line.runs));
    }
    const batHits = batters.reduce((t, b) => t + n(b.h), 0);
    if (HAVE_LINEUPS && batHits !== n(line.hits)) {
      bad.push(side + ': batters have ' + batHits + ' hits but the line says ' + n(line.hits));
    }

    // 3. A hit is the sum of its kinds.
    for (const b of batters) {
      const parts = n(b.b1) + n(b.b2) + n(b.b3) + n(b.hr);
      if (parts !== n(b.h)) {
        bad.push(side + ' ' + b.name + ': 1B+2B+3B+HR = ' + parts + ' but H = ' + n(b.h));
      }
      if (n(b.ab) > n(b.pa)) bad.push(side + ' ' + b.name + ': AB ' + n(b.ab) + ' exceeds PA ' + n(b.pa));
      if (n(b.h) > n(b.ab)) bad.push(side + ' ' + b.name + ': H exceeds AB');
      for (const k of ['pa', 'ab', 'h', 'r', 'rbi', 'bb', 'so', 'hr', 'sf', 'gidp', 'sb']) {
        if (n(b[k]) < 0) bad.push(side + ' ' + b.name + ': negative ' + k);
      }
    }

    // 4. This side's pitchers must account for the OTHER side's batting.
    const oppPA = oppBatters.reduce((t, b) => t + n(b.pa), 0);
    const bf = pitchers.reduce((t, p) => t + n(p.bf), 0);
    if (HAVE_LINEUPS && bf !== oppPA) {
      bad.push(side + ' pitchers faced ' + bf + ' but the opponent had ' + oppPA + ' plate appearances');
    }
    const oppHits = oppBatters.reduce((t, b) => t + n(b.h), 0);
    const pHits = pitchers.reduce((t, p) => t + n(p.h), 0);
    if (HAVE_LINEUPS && pHits !== oppHits) {
      bad.push(side + ' pitchers allowed ' + pHits + ' hits, opponent batters have ' + oppHits);
    }
    const oppSo = oppBatters.reduce((t, b) => t + n(b.so), 0);
    const pSo = pitchers.reduce((t, p) => t + n(p.so), 0);
    if (HAVE_LINEUPS && pSo !== oppSo) bad.push(side + ' pitchers struck out ' + pSo + ', batters show ' + oppSo);
    const pRuns = pitchers.reduce((t, p) => t + n(p.r), 0);
    if (pRuns !== n(opp.runs)) {
      bad.push(side + ' pitchers allowed ' + pRuns + ' runs, opponent line says ' + n(opp.runs));
    }

    // 5. Outs and innings.
    const outs = pitchers.reduce((t, p) => t + n(p.outs), 0);
    if (outs % 1 !== 0 || outs < 0) bad.push(side + ': impossible out total ' + outs);
    const innings = Math.max((box.away.innings || []).length, (box.home.innings || []).length);
    if (innings < 5) bad.push('game ran only ' + innings + ' innings');
    if (innings > 30) bad.push('game ran ' + innings + ' innings');
    // A side cannot record more outs than innings allow, plus a cushion for the
    // half-innings the other side bats.
    if (outs > innings * 3 + 6) {
      bad.push(side + ': ' + outs + ' outs in a ' + innings + '-inning game');
    }
    for (const p of pitchers) {
      for (const k of ['outs', 'bf', 'h', 'r', 'er', 'bb', 'so', 'hr', 'pitches']) {
        if (n(p[k]) < 0) bad.push(side + ' ' + p.name + ': negative ' + k);
      }
      if (n(p.er) > n(p.r)) bad.push(side + ' ' + p.name + ': earned runs exceed runs');
      if (n(p.outs) === 0 && n(p.bf) === 0) bad.push(side + ' ' + p.name + ': appears with no work');
      if (n(p.pitches) > 0 && n(p.bf) === 0) bad.push(side + ' ' + p.name + ': pitches thrown to nobody');
    }

    // 6. No duplicate or missing people.
    const names = batters.map((b) => b.name).concat(pitchers.map((p) => p.name));
    const seen = Object.create(null);
    for (const nm of names) {
      if (!nm) { bad.push(side + ': an unnamed participant'); continue; }
      if (seen[nm]) bad.push(side + ': ' + nm + ' appears twice');
      seen[nm] = true;
    }
    if (HAVE_LINEUPS && batters.length < 9) bad.push(side + ': only ' + batters.length + ' batters');
    if (!pitchers.length) bad.push(side + ': no pitchers');

    // 7. Substitutions preserve the batting order. Slots must be non-decreasing
    // through the list, and a substitute must share a slot with the man he
    // replaced rather than inventing a tenth place in the order.
    let lastSlot = -1;
    for (const b of batters) {
      const slot = Number(b.slot);
      if (!Number.isFinite(slot)) { bad.push(side + ' ' + b.name + ': no batting slot'); continue; }
      if (slot < 0 || slot > 8) bad.push(side + ' ' + b.name + ': slot ' + slot + ' outside the order');
      if (slot < lastSlot) bad.push(side + ': batting order out of sequence at ' + b.name);
      lastSlot = Math.max(lastSlot, slot);
    }
    const starters = batters.filter((b) => !b.sub);
    if (HAVE_LINEUPS && starters.length !== 9) {
      bad.push(side + ': ' + starters.length + ' starting batters, expected 9');
    }
    const starterSlots = starters.map((b) => Number(b.slot)).sort((x, y) => x - y);
    if (HAVE_LINEUPS) for (let i = 0; i < 9; i += 1) {
      if (starterSlots[i] !== i) { bad.push(side + ': starting order does not cover slots 0-8'); break; }
    }
    for (const b of batters) {
      if (!b.sub) continue;
      const owner = starters.filter((x) => Number(x.slot) === Number(b.slot))[0];
      if (!owner) bad.push(side + ' ' + b.name + ': substitute in a slot nobody started');
    }
  }

  // 8. Decisions. Exactly one winner and one loser, and they must have pitched.
  const allNames = ['away', 'home'].reduce((acc, s) => acc.concat(((box.players[s] || {}).pitchers || []).map((p) => p.name)), []);
  const wp = box.derivedWinPitcherName;
  const lp = box.derivedLosePitcherName;
  const tied = n(box.away.runs) === n(box.home.runs);
  // derivedWinPitcherName is defined only for regulation, non-walk-off, unstopped
  // games -- walk-offs and extras take their decisions through pitcherDecisions(),
  // which renders them into the box score HTML rather than onto the pitcher rows.
  // Asserting the field outside its contract would be testing the test.
  const decisionsDerived = !box.walkOff && !box.extraInnings && box.gameStatus === 'final';
  if (!tied && decisionsDerived) {
    if (!wp) bad.push('no winning pitcher in a decided game');
    if (!lp) bad.push('no losing pitcher in a decided game');
    if (wp && allNames.indexOf(wp) === -1) bad.push('winning pitcher ' + wp + ' never pitched');
    if (lp && allNames.indexOf(lp) === -1) bad.push('losing pitcher ' + lp + ' never pitched');
    if (wp && lp && wp === lp) bad.push('the same pitcher won and lost');
  }

  return bad.map((m) => 'seed ' + seed + ' -- ' + m);
}

process.stdout.write('\n  MLB BOX SCORE RECONCILIATION -- release candidate, ' + GAMES + ' games\n\n');

const sim = loadEngine();
const teams = sim.localTeams.current;
const probe = sim.simulate(teams[0], teams[1], {}, 'recon-probe', false, null);
const HAVE_LINEUPS = (((probe.boxScore.players.home || {}).batters) || []).length >= 9;
process.stdout.write('  lineups                ' + (HAVE_LINEUPS
  ? 'real, from the roster snapshot'
  : 'SYNTHETIC -- batter-level invariants are not exercised in this run') + String.fromCharCode(10));
let violations = [];
let played = 0;
for (let i = 0; i < GAMES; i += 1) {
  const away = teams[i % teams.length];
  const home = teams[(i + 7 + (i % 5)) % teams.length];
  if (away === home) continue;
  const seed = 'recon-' + i;
  const r = sim.simulate(away, home, {}, seed, false, null);
  played += 1;
  const bad = reconcile(r, seed);
  if (bad.length) violations = violations.concat(bad);
  if (violations.length > 40) break;
}

process.stdout.write('  games played           ' + played + '\n');
process.stdout.write('  invariant violations   ' + violations.length + '\n');
if (violations.length) {
  process.stdout.write('\n');
  for (const v of violations.slice(0, 20)) process.stdout.write('    ' + v + '\n');
  process.stdout.write('\n');
  process.exit(1);
}

// 9. A seeded game must reproduce in a FRESH interpreter, not merely in this one.
const sim2 = loadEngine();
const t2 = sim2.localTeams.current;
const a = sim.simulate(teams[3], teams[11], {}, 'recon-repro', false, null);
const b = sim2.simulate(t2[3], t2[11], {}, 'recon-repro', false, null);
const key = (r) => JSON.stringify([r.boxScore.away, r.boxScore.home,
  (r.boxScore.players.away.batters || []).map((x) => [x.name, x.pa, x.h, x.r]),
  (r.boxScore.players.home.pitchers || []).map((x) => [x.name, x.outs, x.so]),
  Number(r.homeWin).toFixed(6)]);
assert.strictEqual(key(a), key(b), 'the same seed produced a different game in a fresh interpreter');
process.stdout.write('  seeded reproduction    identical in a fresh interpreter\n');
process.stdout.write('\n  Every box score reconciles.\n\n');
