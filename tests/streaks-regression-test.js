#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'static', 'js', 'streaks.js'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'profile', 'index.html'), 'utf8');

assert(source.includes('function calculateStreaks(picks, options)'), 'shared streak calculator must remain available');
assert(source.includes("if (status === 'push') continue;"), 'pushes must remain neutral inside current streak calculation');
assert(source.includes('pick && pick.graded_at'), 'streak ordering must prefer graded_at');
assert(source.includes('pick && pick.locked_at'), 'streak ordering must keep locked_at fallback');
assert(!profile.includes('Pushes reset streaks.'), 'profile copy must not claim pushes reset streaks');
assert(profile.includes('Pushes are tracked but skipped for W/L streaks.'), 'profile copy must explain push-neutral streak behavior');

const { calculateStreaks, formatStreak } = require('../static/js/streaks.js');

const picks = [
  { id: 'older-win', status: 'won', locked_at: '2026-05-01T18:00:00Z' },
  { id: 'loss-before-push', status: 'lost', locked_at: '2026-05-02T18:00:00Z' },
  { id: 'latest-push', status: 'push', locked_at: '2026-05-03T18:00:00Z' },
  { id: 'pending-ignored', status: 'pending', locked_at: '2026-05-04T18:00:00Z' },
];

const neutralPush = calculateStreaks(picks);
assert.strictEqual(neutralPush.currentStreak, -1, 'latest push is neutral and keeps the latest loss streak active');
assert.strictEqual(neutralPush.currentType, 'loss', 'current type follows latest non-push result');
assert.strictEqual(neutralPush.longestWinStreak, 1, 'best win streak counts wins chronologically');
assert.strictEqual(neutralPush.longestLossStreak, 1, 'worst loss streak counts losses chronologically');
assert.strictEqual(formatStreak(neutralPush.currentStreak), '1L', 'negative streaks format as losses');

const bridgedPush = calculateStreaks([
  { id: 'loss-1', status: 'lost', locked_at: '2026-05-01T18:00:00Z' },
  { id: 'push-between-losses', status: 'pushed', locked_at: '2026-05-02T18:00:00Z' },
  { id: 'loss-2', status: 'lost', locked_at: '2026-05-03T18:00:00Z' },
]);
assert.strictEqual(bridgedPush.currentStreak, -2, 'pushes do not break a current loss run');
assert.strictEqual(bridgedPush.longestLossStreak, 2, 'pushes do not break worst loss run');

const gradedAtFirst = calculateStreaks([
  { id: 'created-late-graded-early', status: 'won', created_at: '2026-05-04T18:00:00Z', graded_at: '2026-05-01T18:00:00Z' },
  { id: 'created-early-graded-late', status: 'lost', created_at: '2026-05-01T18:00:00Z', graded_at: '2026-05-04T18:00:00Z' },
]);
assert.strictEqual(gradedAtFirst.currentStreak, -1, 'graded_at controls ledger streak order ahead of created_at');
assert.deepStrictEqual(gradedAtFirst.sequence.map(item => item.id), ['created-late-graded-early', 'created-early-graded-late'], 'sequence follows settled ledger order');

console.log('streaks regression test passed');
