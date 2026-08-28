#!/usr/bin/env node
'use strict';

/**
 * mlb-runs-versus-hits-test.js -- a team cannot score far more runs than it has
 * hits.
 *
 * Runs arrive without hits in real baseball: walks, hit batsmen, errors,
 * sacrifice flies, wild pitches, stolen bases, a runner moving up on an out.
 * Every one of those is modelled here, and the release candidate added two more
 * of them (the ground-ball advance and the tag-up). Adding ways to score without
 * hitting is exactly the kind of change that can quietly break the relationship
 * between the two numbers.
 *
 * MEASURED, NOT ASSUMED. Across 4,860 real team-games of the 2025 season, a team
 * scoring seven or more runs above its hit total happens ZERO times. The largest
 * real gap is smaller than that. The 12,000-game realism suite found two such
 * team-games in the candidate, one of them a gap of nine, which is a shape real
 * baseball does not produce.
 *
 * This is a candidate-specific regression test rather than a general realism
 * check: it exists because that defect was introduced here, and it stays so the
 * next person adding a way to score without a hit finds out immediately.
 *
 * The bound is the real maximum plus room for the tail a finite sample cannot
 * rule out. It is not a literal zero, because 4,860 games cannot establish a
 * zero probability for a rare event -- but a gap of seven was never observed and
 * a gap of nine is not defensible.
 *
 *   node tests/mlb-runs-versus-hits-test.js
 *   TMR_MLB_RVH_GAMES=3000 node tests/mlb-runs-versus-hits-test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js');
const GAMES = Number(process.env.TMR_MLB_RVH_GAMES || 1500);
const BB_TABLE = process.env.TMR_MLB_BB_TABLE_PATH || '';

/** Observed maximum in 4,860 real team-games of 2025 is below this. */
const MAX_GAP = 6;

function loadEngine(rc) {
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
  if (rc) {
    ctx.window.TMR_MLB_WORKLOAD_V2 = true;
    ctx.window.TMR_MLB_STARTER_RESIDUAL = 0.010;
    if (BB_TABLE && fs.existsSync(BB_TABLE)) {
      ctx.window.TMR_MLB_BB_TABLE = JSON.parse(fs.readFileSync(BB_TABLE, 'utf8'));
    }
  }
  vm.runInNewContext(fs.readFileSync(ENGINE, 'utf8'), ctx);
  const sim = ctx.window.TMRMlbSimulator;
  sim.state.simulationCount = 2;
  return sim;
}

/** Every era pool, because the failures were found in historical and mixed. */
function measure(sim) {
  const pools = ['current', 'historical', 'mixed'];
  let teamGames = 0;
  let over = 0;
  let worst = 0;
  const examples = [];
  for (let i = 0; i < GAMES; i += 1) {
    const pool = sim.localTeams[pools[i % 3]] || sim.localTeams.current;
    const away = pool[i % pool.length];
    const home = pool[(i + 7 + (i % 5)) % pool.length];
    if (!away || !home || away === home) continue;
    const r = sim.simulate(away, home, {}, null, false, null);
    if (!r || !r.boxScore) continue;
    for (const side of ['away', 'home']) {
      const line = r.boxScore[side];
      const gap = Number(line.runs || 0) - Number(line.hits || 0);
      teamGames += 1;
      if (gap > worst) worst = gap;
      if (gap > MAX_GAP) {
        over += 1;
        if (examples.length < 4) {
          examples.push(away.abbreviation + ' at ' + home.abbreviation
            + ': ' + line.runs + ' runs on ' + line.hits + ' hits');
        }
      }
    }
  }
  return { teamGames, over, worst, examples };
}

process.stdout.write('\n  MLB RUNS VERSUS HITS -- candidate against production\n\n');

const base = measure(loadEngine(false));
const cand = measure(loadEngine(true));

for (const [label, m] of [['production', base], ['candidate ', cand]]) {
  process.stdout.write('  ' + label + '  team-games ' + m.teamGames
    + '   gap above ' + MAX_GAP + ': ' + m.over
    + '   worst gap ' + m.worst + '  (real maximum below ' + (MAX_GAP + 1) + ')\n');
  for (const e of m.examples) process.stdout.write('      ' + e + '\n');
}
process.stdout.write('\n');

assert.strictEqual(cand.over, 0,
  'the candidate produced ' + cand.over + ' team-game(s) scoring more than '
  + MAX_GAP + ' runs above its hit total, worst gap ' + cand.worst
  + '. Across 4,860 real team-games of 2025 that happens zero times. '
  + 'Something is creating runs without baserunners.');

assert.ok(cand.worst <= base.worst + 1,
  'the candidate widened the worst runs-over-hits gap from ' + base.worst
  + ' to ' + cand.worst + ' against production');

process.stdout.write('  Runs and hits stay in a relationship real baseball recognises.\n\n');
