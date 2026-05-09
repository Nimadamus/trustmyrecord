const assert = require('assert');
const { calculateStreaks, formatStreak } = require('../static/js/streaks.js');

function pick(status, day) {
  return {
    id: status + '-' + day,
    status,
    graded_at: `2026-05-${String(day).padStart(2, '0')}T12:00:00Z`
  };
}

function expectStreak(name, picks, expected) {
  const actual = calculateStreaks(picks);
  assert.strictEqual(actual.longestWinStreak, expected.bestWin, `${name}: longest win`);
  assert.strictEqual(actual.longestLossStreak, expected.bestLoss, `${name}: longest loss`);
  assert.strictEqual(actual.currentStreak, expected.current, `${name}: current`);
}

expectStreak('wins only', [
  pick('won', 1),
  pick('won', 2),
  pick('won', 3)
], { bestWin: 3, bestLoss: 0, current: 3 });

expectStreak('losses only', [
  pick('lost', 1),
  pick('lost', 2),
  pick('lost', 3)
], { bestWin: 0, bestLoss: 3, current: -3 });

expectStreak('pushes are neutral', [
  pick('won', 1),
  pick('won', 2),
  pick('push', 3),
  pick('won', 4),
  pick('lost', 5),
  pick('push', 6)
], { bestWin: 3, bestLoss: 1, current: -1 });

expectStreak('pending ignored', [
  pick('won', 1),
  pick('lost', 2),
  pick('pending', 3)
], { bestWin: 1, bestLoss: 1, current: -1 });

expectStreak('graded time wins over locked time', [
  { id: 1, status: 'won', locked_at: '2026-05-09T12:00:00Z', graded_at: '2026-05-09T13:00:00Z' },
  { id: 2, status: 'lost', locked_at: '2026-05-09T12:05:00Z', graded_at: '2026-05-09T14:00:00Z' },
  { id: 3, status: 'lost', locked_at: '2026-05-09T12:10:00Z', graded_at: '2026-05-09T15:00:00Z' }
], { bestWin: 1, bestLoss: 2, current: -2 });

expectStreak('latest push is skipped for current streak', [
  pick('won', 1),
  pick('won', 2),
  pick('push', 3)
], { bestWin: 2, bestLoss: 0, current: 2 });

assert.strictEqual(formatStreak(3), '3W');
assert.strictEqual(formatStreak(-2), '2L');
assert.strictEqual(formatStreak(0), '0');

console.log('streaks-test passed');
