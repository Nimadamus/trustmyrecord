#!/usr/bin/env node
// LEADERBOARDS_HERO_TAB_COUNT_LOCK_20260710 guard.
//
// The leaderboards hub has two places that show the same five numbers: the
// hero stat cards (qs*) and the tab badges (tabCount*). They used to be set
// from different code paths and defaulted to different placeholders ("--" in
// the hero, "0" in the tabs), so they routinely disagreed. This test proves
// they can never disagree again by enforcing the single-writer contract:
//
//   1) Every hero card default is a real number ("0"), never "--".
//   2) Every count id is written ONLY through setCount()/COUNT_ELS -- no code
//      touches qs*/tabCount* .textContent directly.
//   3) COUNT_ELS pairs each metric's hero id with its tab id, and setCount()
//      writes BOTH from one value (clamped to a non-negative integer), so the
//      hero card and its tab badge are structurally identical.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'leaderboards', 'index.html'), 'utf8');

const HERO_IDS = ['qsHandicappers', 'qsTrivia', 'qsPolls', 'qsChallenges', 'qsH2H'];
const TAB_IDS = ['tabCountHandicappers', 'tabCountTrivia', 'tabCountPolls', 'tabCountOnline', 'tabCountH2H'];
const ALL_IDS = HERO_IDS.concat(TAB_IDS);

// ---- 1. hero defaults must be numeric, never "--" --------------------------
HERO_IDS.forEach(function (id) {
  const m = html.match(new RegExp('id="' + id + '">([^<]*)</b>'));
  assert(m, 'hero card #' + id + ' must exist');
  assert(/^\d+$/.test(m[1].trim()), 'hero card #' + id + ' default must be a number, got "' + m[1] + '"');
  assert(m[1].trim() !== '--', 'hero card #' + id + ' must not default to "--"');
});

// ---- 2. no direct textContent writes to any count id -----------------------
ALL_IDS.forEach(function (id) {
  const direct = new RegExp("getElementById\\('" + id + "'\\)\\s*\\.textContent");
  assert(!direct.test(html), id + ' must be written only through setCount(), not getElementById().textContent');
});

// ---- 3. behavioral: setCount writes both paired elements from one source ---
function grab(name) {
  // Pull the real source of a top-level `const NAME = ... ;` / `function NAME`
  const idx = html.indexOf(name);
  assert(idx !== -1, 'source must define ' + name);
}
['COUNT_ELS', 'setCount', 'countByStatus', 'ONLINE_LIVE_STATUSES', 'H2H_ACTIVE_STATUSES'].forEach(grab);

// Extract the canonical counter block and run it in a sandbox with a fake DOM.
const block = html.slice(
  html.indexOf('const COUNT_ELS'),
  html.indexOf('function setQuickStats')
);
assert(block.includes('function setCount'), 'counter block must contain setCount');

const store = {};
ALL_IDS.forEach(function (id) { store[id] = { textContent: '--' }; });
const sandbox = {
  document: { getElementById: function (id) { return store[id] || null; } },
};
vm.createContext(sandbox);
vm.runInContext(block + '\nthis.setCount = setCount; this.COUNT_ELS = COUNT_ELS; this.countByStatus = countByStatus;', sandbox);

const METRICS = {
  handicappers: ['qsHandicappers', 'tabCountHandicappers'],
  trivia: ['qsTrivia', 'tabCountTrivia'],
  polls: ['qsPolls', 'tabCountPolls'],
  online: ['qsChallenges', 'tabCountOnline'],
  h2h: ['qsH2H', 'tabCountH2H'],
};

Object.keys(METRICS).forEach(function (metric) {
  const pair = sandbox.COUNT_ELS[metric];
  assert.strictEqual(JSON.stringify(pair), JSON.stringify(METRICS[metric]), 'COUNT_ELS.' + metric + ' must pair hero+tab ids');
  [0, 1, 7, 42].forEach(function (n) {
    sandbox.setCount(metric, n);
    const hero = store[pair[0]].textContent;
    const tab = store[pair[1]].textContent;
    assert.strictEqual(hero, String(n), metric + ' hero should be ' + n);
    assert.strictEqual(hero, tab, metric + ' hero (' + hero + ') and tab (' + tab + ') must match');
  });
  // valid zero shows "0", never "--"; junk clamps to 0
  [undefined, null, NaN, -5, '--'].forEach(function (bad) {
    sandbox.setCount(metric, bad);
    assert.strictEqual(store[pair[0]].textContent, '0', metric + ' bad input must render 0');
    assert.strictEqual(store[pair[0]].textContent, store[pair[1]].textContent, metric + ' bad input must still match');
  });
});

// ---- 4. countByStatus filters to "currently active" only -------------------
const sample = [
  { status: 'pending' }, { status: 'accepted' }, { status: 'completed' },
  { status: 'cancelled' }, { status: 'in_progress' }, { status: 'LIVE' },
];
assert.strictEqual(
  sandbox.countByStatus(sample, ['pending', 'open', 'accepted', 'in_progress', 'live']),
  4,
  'countByStatus must count only active statuses (pending/accepted/in_progress/live), excluding completed+cancelled'
);

console.log('leaderboards hero/tab count lock: OK');
