#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'static', 'js', 'stats-engine.js'), 'utf8');

assert(source.includes('class StatsEngine'), 'StatsEngine class must remain defined');
assert(source.includes("const pendingPicks = picks.filter(p => p.status === 'pending');"), 'pending picks must remain explicitly counted');
assert(source.includes("const gradedPicks = picks.filter(p => p.status !== 'pending');"), 'graded picks must continue excluding pending picks');
/* Rewritten 2026-08-16: the engine was refactored from free actualRiskUnits()/
   toWinUnits() helpers into getStakeValues(pick) -> { riskUnits, toWinUnits },
   and the stored-units check is now inline instead of a `const stored`. The
   invariant is unchanged and is what these assert: a settled pick uses the
   STORED result_units first, and only falls back to stake math. */
assert(source.includes('if (pick && pick.result_units != null && !Number.isNaN(Number(pick.result_units))) return Number(pick.result_units);'), 'stored result_units must remain the first source for settled units');
assert(source.includes('getStakeValues(pick)'), 'stake calculator must remain');
assert(source.includes('toWinUnits:'), 'to-win units must remain part of the stake result');

const storage = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  },
  Date,
  JSON,
  Math,
  Number,
  String,
  parseFloat,
  parseInt,
  isNaN,
};

const exported = vm.runInNewContext(`${source}\n({ StatsEngine, statsEngine });`, sandbox);
const engine = new exported.StatsEngine();

/* Rewritten 2026-08-16 to the engine's current API. actualRiskUnits(),
   toWinUnits() and pickResultUnits() were folded into getStakeValues(pick) ->
   { riskUnits, toWinUnits } and calculatePickNet(). The stake math itself is
   unchanged, EXCEPT that an ambiguous ticket (a stake with no stake_mode) is no
   longer guessed at -- it returns zeros and flags the pick for review. That
   hardening is asserted below rather than asserted away. */
const explicitBoth = engine.getStakeValues({ risk_units: 2, to_win_units: 3, odds_snapshot: 150 });
assert.strictEqual(explicitBoth.riskUnits, 2, 'explicit risk_units is used as-is');
assert.strictEqual(explicitBoth.toWinUnits, 3, 'explicit to_win_units is used as-is');

/* Server parity: these single-sided tickets are exactly what riskUnitsSql
   derives on the backend, so the client must derive them too. */
const riskOnly = engine.getStakeValues({ risk_units: 2, odds_snapshot: 150 });
assert.strictEqual(riskOnly.riskUnits, 2, 'risk-only ticket risks the declared units');
assert.strictEqual(riskOnly.toWinUnits, 3, 'positive odds to-win derives from risk');
const toWinOnly = engine.getStakeValues({ to_win_units: 2, odds_snapshot: -150 });
assert.strictEqual(toWinOnly.riskUnits, 3, 'negative odds risk derives from to-win units');
assert.strictEqual(toWinOnly.toWinUnits, 2, 'to-win-only ticket wins the declared units');

const riskMode = engine.getStakeValues({ stake_mode: 'risk', units: 2, odds_snapshot: 150 });
assert.strictEqual(riskMode.riskUnits, 2, 'risk mode risks the declared units');
assert.strictEqual(riskMode.toWinUnits, 3, 'positive odds to-win derives from risk');

const toWinMode = engine.getStakeValues({ stake_mode: 'to_win', units: 2, odds_snapshot: -150 });
assert.strictEqual(toWinMode.riskUnits, 3, 'negative odds risk derives from to-win units');
assert.strictEqual(toWinMode.toWinUnits, 2, 'to-win mode wins the declared units');

const ambiguous = { units: 2, odds_snapshot: 150 };  // stake only: genuinely ambiguous
const ambiguousStake = engine.getStakeValues(ambiguous);
assert.strictEqual(ambiguousStake.riskUnits, 0, 'a ticket with no stake_mode is never guessed at');
assert.strictEqual(ambiguousStake.toWinUnits, 0, 'a ticket with no stake_mode is never guessed at');
assert.strictEqual(ambiguous.stake_review_required, true, 'an ambiguous ticket is flagged for review instead of being priced');

assert.strictEqual(engine.calculatePickNet({ status: 'won', result_units: 4.25, risk_units: 1, to_win_units: 2, odds_snapshot: 200 }), 4.25, 'stored result_units wins over recalculation');
assert.strictEqual(engine.calculatePickNet({ status: 'pending', result_units: 99, risk_units: 1, to_win_units: 2, odds_snapshot: 200 }), 99, 'stored units remain readable for direct audit calls');

const picks = [
  {
    username: 'RecordGuard',
    status: 'won',
    risk_units: 2,
    odds_snapshot: 150,
    result_units: 3,
    sport: 'MLB',
    market_type: 'h2h',
    locked_at: '2026-05-01T18:00:00Z',
  },
  {
    username: 'RecordGuard',
    status: 'lost',
    to_win_units: 2,
    odds_snapshot: -150,
    sport: 'MLB',
    market_type: 'spreads',
    locked_at: '2026-05-02T18:00:00Z',
  },
  {
    username: 'RecordGuard',
    status: 'push',
    risk_units: 1,
    odds_snapshot: -110,
    result_units: 0,
    sport: 'NBA',
    market_type: 'totals',
    locked_at: '2026-05-03T18:00:00Z',
  },
  {
    username: 'RecordGuard',
    status: 'pending',
    risk_units: 10,
    odds_snapshot: 200,
    result_units: 99,
    sport: 'NFL',
    market_type: 'h2h',
    locked_at: '2026-05-04T18:00:00Z',
  },
];

storage.set('tmr_picks', JSON.stringify(picks));

const stats = engine.calculateUserStats('RecordGuard');
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(stats.record)),
  { wins: 1, losses: 1, pushes: 1, pending: 1 },
  'record separates graded and pending picks'
);
assert.strictEqual(stats.totalPicks, 4, 'totalPicks includes pending for owner/account count');
assert.strictEqual(stats.totalGraded, 3, 'totalGraded excludes pending picks');
assert.strictEqual(stats.winRate, 50, 'win rate excludes pushes and pending picks');
assert.strictEqual(stats.units, 0, 'pending result_units must not leak into public units');
assert.strictEqual(stats.roi, 0, 'ROI uses settled risk only and excludes pending risk');
assert.strictEqual(stats.sportBreakdown.NFL.pending, 1, 'sport breakdown keeps pending count separate');
assert.strictEqual(Number(stats.sportBreakdown.NFL.units), 0, 'pending sport units remain zero');
assert.strictEqual(stats.streaks.current, -1, 'pushes remain neutral and preserve the latest W/L streak');
assert.strictEqual(stats.streaks.type, 'loss', 'current streak type follows the latest non-push result');
assert.strictEqual(stats.streaks.best, 1, 'best streak reads chronological graded wins');
assert.strictEqual(stats.streaks.worst, 1, 'worst streak reads chronological graded losses');

console.log('stats engine regression test passed');
