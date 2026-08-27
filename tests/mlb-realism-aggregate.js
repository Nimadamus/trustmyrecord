#!/usr/bin/env node
'use strict';

/**
 * Merge sharded realism runs and apply the release gate to the whole.
 *
 * The suite calls simulate() with no seed, so every iteration is an independent
 * draw and the only thing the loop index decides is which matchup is played.
 * Shard k runs every index where i % shards === k, so the union is exactly
 * 0..11999 with nothing repeated and nothing missed. Every metric is a sum, a
 * maximum, a count, or a set-deduplicated list, all of which merge exactly.
 *
 * This file holds NO tolerances of its own. Every assertion below is the same
 * assertion the sequential suite makes, against the merged totals, so a sharded
 * pass and a sequential pass mean the same thing.
 *
 *   node tests/mlb-realism-aggregate.js <shard-0.json> <shard-1.json> ...
 */

const assert = require('assert');
const fs = require('fs');

const NL = String.fromCharCode(10);
const say = (m) => process.stdout.write(m + NL);

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) {
  say('usage: node tests/mlb-realism-aggregate.js <shard json> ...');
  process.exit(1);
}

const shards = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));

/* --- the merge must be provably complete before anything is judged --------- */

const expectedShards = shards[0].shards;
const totalSimulations = shards[0].totalSimulations;

assert.strictEqual(shards.length, expectedShards,
  'expected ' + expectedShards + ' shard files, got ' + shards.length);

const seen = new Set(shards.map((s) => s.shard));
assert.strictEqual(seen.size, expectedShards,
  'shard indices are not distinct: ' + [...seen].join(','));
for (let k = 0; k < expectedShards; k += 1) {
  assert(seen.has(k), 'shard ' + k + ' is missing from the merge');
}
for (const s of shards) {
  assert.strictEqual(s.totalSimulations, totalSimulations,
    'shard ' + s.shard + ' ran a different total');
}

const ran = shards.reduce((t, s) => t + s.ran, 0);
assert.strictEqual(ran, totalSimulations,
  'shards ran ' + ran + ' simulations between them, expected ' + totalSimulations);

/* --- merge ---------------------------------------------------------------- */

const sum = (k) => shards.reduce((t, s) => t + (s[k] || 0), 0);
const max = (k) => shards.reduce((t, s) => Math.max(t, s[k] || 0), 0);

const homeRunTotal = sum('homeRunTotal');
const awayRunTotal = sum('awayRunTotal');
const expectedHomeRunTotal = sum('expectedHomeRunTotal');
const expectedAwayRunTotal = sum('expectedAwayRunTotal');

const summary = {
  totalSimulations,
  highestScoreObserved: max('highestScoreObserved'),
  highestCombinedScoreObserved: max('highestCombinedScoreObserved'),
  gamesAbove15TotalRuns: sum('gamesAbove15TotalRuns'),
  gamesAbove20TotalRuns: sum('gamesAbove20TotalRuns'),
  teamScoresAbove15: sum('teamScoresAbove15'),
  teamScoresAbove18: sum('teamScoresAbove18'),
  combinedScoresAbove25: sum('combinedScoresAbove25'),
  invalidOutputs: sum('invalidOutputs'),
  reliefAppearances: sum('reliefAppearances'),
  reliefFiveHit: sum('reliefFiveHit'),
  reliefEightHit: sum('reliefEightHit'),
  invalidExamples: [],
  modeCounts: { current: 0, historical: 0, mixed: 0 },
};

for (const s of shards) {
  for (const mode of Object.keys(summary.modeCounts)) {
    summary.modeCounts[mode] += (s.modeCounts && s.modeCounts[mode]) || 0;
  }
  for (const ex of (s.invalidExamples || [])) {
    if (summary.invalidExamples.length < 10) summary.invalidExamples.push(ex);
  }
}

// Extremes are deduplicated ACROSS shards on the same key the sequential run
// uses within one process, so a game cannot be counted twice by two workers.
const extremeKeys = new Set();
const extremes = [];
for (const s of shards) {
  for (const e of (s.extremes || [])) {
    const key = e.key || [e.mode, e.score, e.starters].join('|');
    if (extremeKeys.has(key)) continue;
    extremeKeys.add(key);
    extremes.push(e);
  }
}

summary.averageHomeRunsScored = Number((homeRunTotal / totalSimulations).toFixed(2));
summary.averageAwayRunsScored = Number((awayRunTotal / totalSimulations).toFixed(2));
summary.averageTotalRunsScored = Number((summary.averageHomeRunsScored + summary.averageAwayRunsScored).toFixed(2));
summary.averageExpectedHomeRuns = Number((expectedHomeRunTotal / totalSimulations).toFixed(2));
summary.averageExpectedAwayRuns = Number((expectedAwayRunTotal / totalSimulations).toFixed(2));
summary.averageExpectedTotalRuns = Number((summary.averageExpectedHomeRuns + summary.averageExpectedAwayRuns).toFixed(2));
summary.percentageGamesAbove15TotalRuns = Number(((summary.gamesAbove15TotalRuns / totalSimulations) * 100).toFixed(2));
summary.percentageGamesAbove20TotalRuns = Number(((summary.gamesAbove20TotalRuns / totalSimulations) * 100).toFixed(2));
summary.percentageTeamScoresAbove15 = Number(((summary.teamScoresAbove15 / totalSimulations) * 100).toFixed(2));
summary.percentageTeamScoresAbove18 = Number(((summary.teamScoresAbove18 / totalSimulations) * 100).toFixed(2));
summary.percentageCombinedScoresAbove25 = Number(((summary.combinedScoresAbove25 / totalSimulations) * 100).toFixed(2));
summary.extremeValidOutputs = extremes.sort((a, b) => b.totalRuns - a.totalRuns).slice(0, 8);

/* --- report --------------------------------------------------------------- */

say('');
say('  MLB REALISM -- FULL ' + totalSimulations.toLocaleString() + ' SIMULATION GATE');
say('  merged from ' + expectedShards + ' shards, ' + ran.toLocaleString()
  + ' simulations, no index run twice');
say('');
say('  runs per game (home / away / total)   '
  + summary.averageHomeRunsScored + ' / ' + summary.averageAwayRunsScored
  + ' / ' + summary.averageTotalRunsScored);
say('  expected runs (home / away / total)   '
  + summary.averageExpectedHomeRuns + ' / ' + summary.averageExpectedAwayRuns
  + ' / ' + summary.averageExpectedTotalRuns);
say('  requested vs delivered slope          '
  + (summary.averageTotalRunsScored / summary.averageExpectedTotalRuns).toFixed(4));
say('  highest individual / combined score   '
  + summary.highestScoreObserved + ' / ' + summary.highestCombinedScoreObserved);
say('  games above 15 / 20 total runs        '
  + summary.percentageGamesAbove15TotalRuns + '% / '
  + summary.percentageGamesAbove20TotalRuns + '%');
say('  team scores above 15 / 18             '
  + summary.percentageTeamScoresAbove15 + '% / '
  + summary.percentageTeamScoresAbove18 + '%');
say('  combined scores above 25              '
  + summary.percentageCombinedScoresAbove25 + '%');
say('  modes (current / historical / mixed)  '
  + summary.modeCounts.current + ' / ' + summary.modeCounts.historical
  + ' / ' + summary.modeCounts.mixed);
say('  invalid outputs                       ' + summary.invalidOutputs);
say('  one-inning relief outings             ' + summary.reliefAppearances.toLocaleString());
say('    5+ hits                             ' + summary.reliefFiveHit + '  ('
  + (100 * summary.reliefFiveHit / Math.max(summary.reliefAppearances, 1)).toFixed(3)
  + '%, real 0.540%)');
say('    8+ hits                             ' + summary.reliefEightHit + '  ('
  + (100 * summary.reliefEightHit / Math.max(summary.reliefAppearances, 1)).toFixed(4)
  + '%, real 0% of 12,782)');
say('');

/* --- the gate, identical to the sequential suite -------------------------- */

if (summary.invalidOutputs) say(JSON.stringify(summary.invalidExamples, null, 2));
assert.strictEqual(summary.invalidOutputs, 0, 'realism batch has zero invalid outputs');
assert(summary.modeCounts.current > 0 && summary.modeCounts.historical > 0 && summary.modeCounts.mixed > 0,
  'all simulator modes are represented');
assert(summary.highestScoreObserved <= 30,
  'highest individual score ' + summary.highestScoreObserved + ' is beyond the real record of 28');
assert(summary.highestCombinedScoreObserved <= 36,
  'highest combined score ' + summary.highestCombinedScoreObserved + ' is beyond the real record of 33');

const teamGames = totalSimulations * 2;
const bigScoreRate = summary.teamScoresAbove18 / teamGames;
const bigTotalRate = summary.combinedScoresAbove25 / totalSimulations;
assert(bigScoreRate <= 0.012,
  'teams score 19+ in ' + (bigScoreRate * 100).toFixed(3) + '% of games, against 0.149% in real MLB');
assert(bigTotalRate <= 0.015,
  'games total 26+ in ' + (bigTotalRate * 100).toFixed(3) + '% of games, against 0.195% in real MLB');
assert(summary.averageHomeRunsScored >= 4.1 && summary.averageHomeRunsScored <= 5.2,
  'home scoring average ' + summary.averageHomeRunsScored + ' stays in MLB-like range');

// The reliever tail as a rate, on the same bounds the sequential suite uses.
if (summary.reliefAppearances > 0) {
  const fiveRate = summary.reliefFiveHit / summary.reliefAppearances;
  const eightRate = summary.reliefEightHit / summary.reliefAppearances;
  assert(fiveRate <= 0.012,
    'relievers allow 5+ hits in ' + (fiveRate * 100).toFixed(3)
    + '% of one-inning outings, against 0.540% in real MLB');
  assert(eightRate <= 0.0005,
    'relievers allow 8+ hits in ' + (eightRate * 100).toFixed(4)
    + '% of one-inning outings; real MLB never did in 12,782');
}

say('  GATE PASSED on the full ' + totalSimulations.toLocaleString() + ' simulations.');
say('');
