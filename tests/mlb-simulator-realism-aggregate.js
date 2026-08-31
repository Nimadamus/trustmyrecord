#!/usr/bin/env node

/**
 * MLB SIMULATOR REALISM - SHARD AGGREGATOR   REALISM_AGGREGATOR_20260831
 * =============================================================================
 * mlb-simulator-realism-test.js has always been able to SPLIT the twelve
 * thousand simulations (TMR_MLB_SHARDS / TMR_MLB_SHARD / TMR_MLB_SHARD_OUT), and
 * its own header says "the aggregator applies the identical assertions to the
 * merged result" - but no aggregator was ever written. So the sharded mode could
 * produce partial payloads and nothing could turn them back into a verdict, and
 * the only way to get a verdict was one sequential process that runs for over an
 * hour. On a 600-second command limit that is not a slow test, it is an
 * unrunnable one, and an unrunnable test protects nothing.
 *
 * This is that missing half. It merges the raw shard totals and then applies the
 * SAME assertions, with the SAME thresholds, over the SAME twelve thousand
 * simulations. Nothing is weakened, reduced or sampled: the assertion block below
 * is a transcription of the tail of mlb-simulator-realism-test.js, and
 * `--self-check` proves that transcription is faithful by diffing the two.
 *
 * Merge rules, which is why sharding is exact rather than approximate:
 *   - run totals, counts and appearance tallies are SUMS
 *   - the two observed ceilings are MAXIMA
 *   - modeCounts sum per key
 *   - extreme games are carried with their key and de-duplicated on it, so one
 *     extreme game seen by two shards is counted once
 *   - every average and rate is computed HERE, over the full totalSimulations,
 *     so no shard ever divides by its own partial count
 *
 * Usage
 *   node tests/mlb-simulator-realism-aggregate.js <shard-json...>
 *   node tests/mlb-simulator-realism-aggregate.js --dir <dir>
 *   node tests/mlb-simulator-realism-aggregate.js --self-check
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);

/* ---------------------------------------------------------------- self-check */
/* The whole point of an aggregator is that it asserts the same things as the
   suite it stands in for. Proving that by hand is exactly the kind of claim that
   rots, so it is checked mechanically: pull every assert() line out of the tail
   of the realism suite and out of this file, normalise whitespace, and require
   the two sets to match. If someone tightens a bound in the suite and forgets
   this file, --self-check fails and says which line drifted. */
function assertionSignatures(source) {
  const out = [];
  const re = /assert(?:\.strictEqual)?\(([\s\S]*?)\n(?=[a-zA-Z/}]|const |let |if )/g;
  source.split('\n').forEach((line) => {
    const t = line.trim();
    if (!/^assert(\.strictEqual)?\(/.test(t)) return;
    out.push(t.replace(/\s+/g, ' '));
  });
  return out;
}

function selfCheck() {
  const suite = fs.readFileSync(path.join(__dirname, 'mlb-simulator-realism-test.js'), 'utf8');
  const self = fs.readFileSync(__filename, 'utf8');
  // Only the post-loop verdict block matters; everything above it is setup that
  // runs inside the shards themselves.
  const tail = suite.slice(suite.indexOf("assert.strictEqual(summary.invalidOutputs, 0"));
  // The marker is assembled at runtime on purpose: written out whole it would
  // appear here too, and this line - above the input-validation asserts - would
  // be its own first match, so those would be reported as drift.
  const marker = 'verdict' + ' block */';
  const at = self.indexOf(marker);
  assert(at !== -1, 'aggregator is missing its verdict-block marker');
  const mine = self.slice(at);
  const a = assertionSignatures(tail);
  const b = assertionSignatures(mine);
  const missing = a.filter((x) => !b.includes(x));
  const extra = b.filter((x) => !a.includes(x));
  if (missing.length || extra.length) {
    console.error('aggregator assertions have drifted from the realism suite.');
    missing.forEach((m) => console.error('  MISSING here: ' + m));
    extra.forEach((m) => console.error('  EXTRA here:   ' + m));
    process.exit(1);
  }
  console.log('mlb-simulator-realism-aggregate --self-check: ok (' + a.length
    + ' assertions match the suite verbatim)');
  process.exit(0);
}

if (argv.includes('--self-check')) selfCheck();

/* -------------------------------------------------------------------- inputs */
let files = [];
const dirFlag = argv.indexOf('--dir');
if (dirFlag !== -1) {
  const dir = argv[dirFlag + 1];
  assert(dir && fs.existsSync(dir), '--dir needs an existing directory');
  files = fs.readdirSync(dir).filter((f) => /\.json$/.test(f)).map((f) => path.join(dir, f));
} else {
  files = argv.filter((a) => !a.startsWith('--'));
}
assert(files.length, 'no shard payloads given');

const shards = files.map((f) => {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert(Number.isFinite(raw.shard) && Number.isFinite(raw.shards), f + ' is not a shard payload');
  return raw;
});

/* Coverage is a precondition, not a nicety. A merged verdict over eleven of
   twelve shards is not a verdict over twelve thousand simulations, so refuse to
   report one: every shard index must be present exactly once, all payloads must
   agree on the split, and the simulations actually run must add up to the whole. */
const shardCount = shards[0].shards;
const totalSimulations = shards[0].totalSimulations;
shards.forEach((s) => {
  assert.strictEqual(s.shards, shardCount, 'every payload must come from the same ' + shardCount + '-way split');
  assert.strictEqual(s.totalSimulations, totalSimulations, 'every payload must target the same total');
});
const seen = new Set(shards.map((s) => s.shard));
assert.strictEqual(seen.size, shards.length, 'a shard index was supplied twice');
for (let i = 0; i < shardCount; i += 1) {
  assert(seen.has(i), 'shard ' + i + ' of ' + shardCount + ' is missing - refusing to report a partial verdict');
}
const ran = shards.reduce((a, s) => a + s.ran, 0);
assert.strictEqual(ran, totalSimulations,
  'shards ran ' + ran + ' simulations, expected ' + totalSimulations);

/* --------------------------------------------------------------------- merge */
const sum = (k) => shards.reduce((a, s) => a + (Number(s[k]) || 0), 0);
const max = (k) => shards.reduce((a, s) => Math.max(a, Number(s[k]) || 0), 0);

const homeRunTotal = sum('homeRunTotal');
const awayRunTotal = sum('awayRunTotal');
const expectedHomeRunTotal = sum('expectedHomeRunTotal');
const expectedAwayRunTotal = sum('expectedAwayRunTotal');
const reliefAppearances = sum('reliefAppearances');
const reliefFiveHit = sum('reliefFiveHit');
const reliefEightHit = sum('reliefEightHit');

const summary = {
  totalSimulations,
  shards: shardCount,
  averageHomeRunsScored: 0,
  averageAwayRunsScored: 0,
  highestScoreObserved: max('highestScoreObserved'),
  highestCombinedScoreObserved: max('highestCombinedScoreObserved'),
  gamesAbove15TotalRuns: sum('gamesAbove15TotalRuns'),
  gamesAbove20TotalRuns: sum('gamesAbove20TotalRuns'),
  teamScoresAbove15: sum('teamScoresAbove15'),
  teamScoresAbove18: sum('teamScoresAbove18'),
  combinedScoresAbove25: sum('combinedScoresAbove25'),
  invalidOutputs: sum('invalidOutputs'),
  invalidExamples: shards.flatMap((s) => s.invalidExamples || []).slice(0, 8),
  extremeValidOutputs: [],
  modeCounts: { current: 0, historical: 0, mixed: 0 },
};

shards.forEach((s) => {
  Object.keys(summary.modeCounts).forEach((k) => {
    summary.modeCounts[k] += Number((s.modeCounts || {})[k]) || 0;
  });
});

const byKey = new Map();
shards.forEach((s) => (s.extremes || []).forEach((e) => {
  if (!byKey.has(e.key)) byKey.set(e.key, e);
}));

/* ------------------------------------------------ derived over the full 12000 */
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
summary.extremeValidOutputs = [...byKey.values()]
  .sort((a, b) => b.totalRuns - a.totalRuns)
  .slice(0, 8);
summary.reliefAppearances = reliefAppearances;
summary.reliefFiveHit = reliefFiveHit;
summary.reliefEightHit = reliefEightHit;

/* ------------------------------------------------------- verdict block */
/* Transcribed from the tail of mlb-simulator-realism-test.js. --self-check
   diffs the two mechanically; do not edit one without the other. */

if (summary.invalidOutputs) console.log(JSON.stringify(summary.invalidExamples, null, 2));
assert.strictEqual(summary.invalidOutputs, 0, 'realism batch has zero invalid outputs');
assert(summary.modeCounts.current > 0 && summary.modeCounts.historical > 0 && summary.modeCounts.mixed > 0, 'all simulator modes are represented');
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
assert(summary.averageHomeRunsScored >= 4.1 && summary.averageHomeRunsScored <= 5.2, 'home scoring average stays in MLB-like range');

if (reliefAppearances > 0) {
  const fiveRate = reliefFiveHit / reliefAppearances;
  const eightRate = reliefEightHit / reliefAppearances;
  assert(fiveRate <= 0.012,
    'relievers allow 5+ hits in ' + (fiveRate * 100).toFixed(3)
    + '% of one-inning outings, against 0.540% in real MLB');
  assert(eightRate <= 0.0005,
    'relievers allow 8+ hits in ' + (eightRate * 100).toFixed(4)
    + '% of one-inning outings; real MLB never did in 12,782');
}
assert(summary.averageAwayRunsScored >= 3.9 && summary.averageAwayRunsScored <= 5.0, 'away scoring average stays in MLB-like range');
assert(summary.averageTotalRunsScored >= 8.2 && summary.averageTotalRunsScored <= 9.8, 'total run average stays in realistic MLB range');
assert(summary.averageExpectedTotalRuns >= 8.0 && summary.averageExpectedTotalRuns <= 9.5, 'displayed expected-run average stays in realistic MLB range');
assert(summary.percentageGamesAbove15TotalRuns <= 3.5, 'high-total outlier rate stays controlled');
assert(summary.percentageGamesAbove20TotalRuns <= 0.5, '20+ run games stay rare');

console.log('mlb-simulator-realism-test: ok (aggregated over ' + shardCount
  + ' shards, ' + totalSimulations + ' simulations)');
console.log(JSON.stringify(summary, null, 2));
