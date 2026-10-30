'use strict';
/* NFL_TBD_KICKOFF_20261030: unscheduled flex-week games (listed at midnight Eastern) must
   render as TBD, never as a Saturday night kickoff, on the game simulator and the team pages. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function load(file, re) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = re.exec(src);
  assert.ok(m, file + ': isTbdKick not found');
  return new Function(m[0] + '\nreturn isTbdKick;')(); // eslint-disable-line no-new-func
}
const page = load('nfl-simulator/index.html', /function isTbdKick\(iso\)\{[^\n]*\}\}/);
const team = load('scripts/build_nfl_team_pages.js', /const isTbdKick = \(iso\) => \{[\s\S]*?\n\};/);

for (const f of [page, team]) {
  assert.strictEqual(f('2027-01-10T05:00:00.000Z'), true, 'week 18 placeholder (midnight EST)');
  assert.strictEqual(f('2026-12-20T05:00:00.000Z'), true, 'week 16 placeholder');
  assert.strictEqual(f('2026-09-13T04:00:00.000Z'), true, 'midnight EDT placeholder');
  assert.strictEqual(f('2026-12-19T21:30:00.000Z'), false, 'a real Saturday 4:30 PM ET game');
  assert.strictEqual(f('2026-10-27T00:15:00.000Z'), false, 'Monday night 8:15 PM ET');
  assert.strictEqual(f('2026-11-01T17:00:00.000Z'), false, '1 PM ET');
}
const html = fs.readFileSync(path.join(ROOT, 'nfl-simulator', 'index.html'), 'utf8');
assert.ok(/function kickoffPT\(iso\)\{if\(isTbdKick\(iso\)\)return 'Date and time TBD'/.test(html));
assert.ok(/textContent:isTbdKick\(g\.kickoff_utc\)\?'TBD'/.test(html), 'game cards print TBD');
assert.ok(/const dateOf = \(iso\) => \(isTbdKick\(iso\) \? 'TBD'/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'build_nfl_team_pages.js'), 'utf8')));
console.log('NFL_TBD_KICKOFF PASSED');
