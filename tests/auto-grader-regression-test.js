#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'static', 'js', 'auto-grader-fixed.js'), 'utf8');

assert(source.includes('function shouldUseBackendGrading()'), 'grader must keep backend-grading detection');
assert(source.includes('[Grader] Backend API detected; skipping local auto-grader.'), 'local grader must skip when backend API is active');
assert(source.includes('if (!scores.completed)'), 'grader must not grade unfinished games');
assert(source.includes("localStorage.removeItem('tmr_picks_v2')"), 'grader must clear legacy local pick storage');
assert(source.includes('window.TMR_GRADER = TMR_GRADER'), 'grader must expose TMR_GRADER for guarded pages');

const storage = new Map();
const sandbox = {
  console,
  window: {},
  document: {
    readyState: 'loading',
    addEventListener() {},
  },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  },
  fetch: async () => ({ json: async () => ({ events: [] }) }),
  setInterval() { return 1; },
  clearInterval() {},
  Date,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  Math,
};
sandbox.window.localStorage = sandbox.localStorage;

vm.runInNewContext(source, sandbox);

const grader = sandbox.window.TMR_GRADER;
assert(grader, 'TMR_GRADER should be exposed');

assert.strictEqual(
  grader.gradeMoneyline({ selection: 'Boston Celtics', home_team: 'Boston Celtics', away_team: 'New York Knicks' }, 104, 99),
  'won',
  'home moneyline winner grades won'
);
assert.strictEqual(
  grader.gradeMoneyline({ selection: 'New York Knicks', home_team: 'Boston Celtics', away_team: 'New York Knicks' }, 104, 99),
  'lost',
  'away moneyline loser grades lost'
);
assert.strictEqual(
  grader.gradeMoneyline({ selection: 'Unknown Team', home_team: 'Boston Celtics', away_team: 'New York Knicks' }, 104, 99),
  'pending',
  'unmatched moneyline selection remains pending'
);

assert.strictEqual(
  grader.gradeSpread({ selection: 'Boston Celtics -3.5', home_team: 'Boston Celtics', away_team: 'New York Knicks', line_snapshot: -3.5 }, 104, 99),
  'won',
  'spread cover grades won'
);
assert.strictEqual(
  grader.gradeSpread({ selection: 'Boston Celtics -5', home_team: 'Boston Celtics', away_team: 'New York Knicks', line_snapshot: -5 }, 104, 99),
  'push',
  'spread tie grades push'
);
assert.strictEqual(
  grader.gradeSpread({ selection: 'Boston Celtics', home_team: 'Boston Celtics', away_team: 'New York Knicks' }, 104, 99),
  'pending',
  'spread without line remains pending'
);

assert.strictEqual(
  grader.gradeTotal({ selection: 'Over 202.5', line_snapshot: 202.5 }, 104, 99),
  'won',
  'total over grades won'
);
assert.strictEqual(
  grader.gradeTotal({ selection: 'Under 203', line_snapshot: 203 }, 104, 99),
  'push',
  'total equal to line grades push'
);
assert.strictEqual(
  grader.gradeTotal({ selection: 'Team Total Over 4.5', market_type: 'team_totals', line_snapshot: 4.5 }, 104, 99),
  'won',
  'selection side is respected when total text is present'
);

assert.strictEqual(grader.calculateUnits('won', 2, 150), 3, 'positive odds win returns profit units');
assert.strictEqual(grader.calculateUnits('lost', 2, 150), -2, 'positive odds loss returns risked units');
assert.strictEqual(grader.calculateUnits('won', 2, -150), 2, 'negative odds win returns stake units');
assert.strictEqual(grader.calculateUnits('lost', 2, -150), -3, 'negative odds loss returns to-win risk units');
assert.strictEqual(grader.calculateUnits('push', 2, -150), 0, 'push returns zero units');
assert.strictEqual(grader.calculateUnits('pending', 2, -150), 0, 'pending returns zero units');

const graded = grader.gradePick(
  {
    market_type: 'totals',
    selection: 'Over 202.5',
    line_snapshot: 202.5,
    odds_snapshot: 150,
    units: 2,
  },
  { homeScore: 104, awayScore: 99 }
);
assert.strictEqual(graded.status, 'won', 'gradePick carries status');
assert.strictEqual(graded.result, 'won', 'gradePick carries result');
assert.strictEqual(graded.result_units, 3, 'gradePick carries result_units');
assert.strictEqual(graded.home_score, 104, 'gradePick stores home score');
assert.strictEqual(graded.away_score, 99, 'gradePick stores away score');
assert(graded.graded_at, 'gradePick stores graded_at timestamp');

console.log('auto-grader regression test passed');