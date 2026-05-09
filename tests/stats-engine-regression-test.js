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
assert(source.includes('const stored = Number(pick && pick.result_units);'), 'stored result_units must remain the first source for settled units');
assert(source.includes('actualRiskUnits(pick)'), 'risk-unit calculator must remain');
assert(source.includes('toWinUnits(pick)'), 'to-win-unit calculator must remain');

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

assert.strictEqual(engine.actualRiskUnits({ risk_units: 2, odds_snapshot: 150 }), 2, 'risk mode uses explicit risk_units');
assert.strictEqual(engine.toWinUnits({ risk_units: 2, odds_snapshot: 150 }), 3, 'positive odds to-win derives from risk');
assert.strictEqual(engine.actualRiskUnits({ to_win_units: 2, odds_snapshot: -150 }), 3, 'negative odds risk derives from to-win units');
assert.strictEqual(engine.toWinUnits({ to_win_units: 2, odds_snapshot: -150 }), 2, 'to-win mode uses explicit to_win_units');
assert.strictEqual(engine.pickResultUnits({ status: 'won', result_units: 4.25, risk_units: 1, odds_snapshot: 200 }), 4.25, 'stored result_units wins over recalculation');
assert.strictEqual(engine.pickResultUnits({ status: 'pending', result_units: 99, risk_units: 1, odds_snapshot: 200 }), 99, 'stored units remain readable for direct audit calls');

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
