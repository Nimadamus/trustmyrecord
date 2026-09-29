/**
 * Client streak (static/js/streaks.js), 2026-09-28: the streak follows the
 * order the GAMES ENDED, never the order picks were entered or imported, and a
 * member with a graded decision is never 0. Mirrors the backend's
 * tests/streak-completion-order-regression-test.js.
 *
 * Run: node tests/streaks-completion-order-test.js
 */
const assert = require('assert');
const path = require('path');
const { calculateStreaks } = require(path.join(__dirname, '..', 'static/js/streaks.js'));

const H = 3600e3;
let id = 0;
function pick(gameId, startIso, status, o = {}) {
  const start = Date.parse(startIso);
  id += 1;
  const entered = o.entered != null ? o.entered : start - 2 * H;
  return {
    id,
    status,
    game_id: gameId,
    home_team: gameId + ' Home',
    away_team: gameId + ' Away',
    sport_key: 'baseball_mlb',
    commence_time: new Date(start).toISOString(),
    market_type: 'h2h',
    selection: o.selection || gameId + ' side',
    created_at: new Date(entered).toISOString(),
    locked_at: new Date(entered).toISOString(),
    graded_at: new Date(o.graded != null ? o.graded : start + 3 * H).toISOString(),
  };
}
const cur = (rows) => calculateStreaks(rows).currentStreak;
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log('  ok - ' + name); }

check('1. entered out of order: the last game to finish decides', () => {
  assert.strictEqual(cur([
    pick('a2', '2026-09-02T23:00:00Z', 'won'),
    pick('a3', '2026-09-03T23:00:00Z', 'lost'),
    pick('a1', '2026-09-01T23:00:00Z', 'won'),
  ]), -1);
});
check('2. historical picks imported later stay at their game time', () => {
  const imp = Date.parse('2026-09-28T18:00:00Z');
  assert.strictEqual(cur([
    pick('c1', '2026-09-20T23:00:00Z', 'won'),
    pick('c2', '2026-09-21T23:00:00Z', 'won'),
    pick('h1', '2026-08-10T23:00:00Z', 'lost', { entered: imp, graded: imp + 60e3 }),
    pick('h2', '2026-08-11T23:00:00Z', 'lost', { entered: imp, graded: imp + 61e3 }),
  ]), 2);
});
check('3. entered and graded late, but the game finished earlier: sorts earlier', () => {
  assert.strictEqual(cur([
    pick('prev', '2026-09-26T23:00:00Z', 'lost'),
    pick('late', '2026-09-28T01:00:00Z', 'lost', { graded: Date.parse('2026-09-28T04:10:00Z') }),
    pick('early', '2026-09-27T23:00:00Z', 'won', {
      entered: Date.parse('2026-09-28T19:00:00Z'), graded: Date.parse('2026-09-28T20:00:00Z'),
    }),
  ]), -1);
});
check('4. pushes and voids between results are skipped', () => {
  assert.strictEqual(cur([
    pick('p1', '2026-09-11T23:00:00Z', 'won'), pick('p2', '2026-09-12T23:00:00Z', 'push'),
    pick('p3', '2026-09-13T23:00:00Z', 'void'), pick('p4', '2026-09-14T23:00:00Z', 'won'),
  ]), 2);
  assert.strictEqual(cur([
    pick('q1', '2026-09-11T23:00:00Z', 'lost'), pick('q2', '2026-09-12T23:00:00Z', 'won'),
    pick('q3', '2026-09-13T23:00:00Z', 'push'),
  ]), 1);
});
check('5. the latest COMPLETED game decides, not the latest started', () => {
  assert.strictEqual(cur([
    pick('b', '2026-09-23T20:00:00Z', 'lost'),
    pick('long', '2026-09-24T20:00:00Z', 'won', { graded: Date.parse('2026-09-24T23:40:00Z') }),
    pick('short', '2026-09-24T21:00:00Z', 'lost', { graded: Date.parse('2026-09-24T23:30:00Z') }),
  ]), 1);
});
check('6. a split last game is never 0', () => {
  const s = '2026-09-28T00:00:00Z';
  const g = Date.parse(s) + 3 * H;
  assert.strictEqual(cur([
    pick('x0', '2026-09-27T20:00:00Z', 'lost'), pick('x1', '2026-09-27T23:00:00Z', 'won'),
    pick('bl', s, 'won', { selection: 'A', graded: g }), pick('bl', s, 'won', { selection: 'B', graded: g + 1 }),
    pick('bl', s, 'won', { selection: 'C', graded: g + 2 }), pick('bl', s, 'won', { selection: 'D', graded: g + 3 }),
    pick('bl', s, 'lost', { selection: 'E', graded: g + 4 }),
  ]), 4);
  assert.strictEqual(cur([
    pick('m', s, 'won', { selection: 'ML', graded: g }),
    pick('m', s, 'lost', { selection: 'Total', graded: g + 1 }),
  ]), -1);
});
console.log(passed + ' passed');
