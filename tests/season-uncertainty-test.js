'use strict';
/* season-uncertainty-test.js -- LAB_UNCERTAINTY_20261007: NHL season strength uncertainty.
   node tests/season-uncertainty-test.js */
const assert = require('assert');
const E = require('../static/js/league-season-engine.js');
const teams = []; const matchups = {}; const schedule = [];
const divs = [['A', 'Atlantic', 'Eastern'], ['M', 'Metropolitan', 'Eastern'], ['C', 'Central', 'Western'], ['P', 'Pacific', 'Western']];
divs.forEach(([k, div, conf]) => { for (let i = 0; i < 8; i += 1) teams.push({ espn_abbr: k + i, name: k + i, short: k + i, conference: conf, division: div }); });
teams.forEach((h, i) => { matchups[h.espn_abbr] = {}; teams.forEach((a, j) => { if (i !== j) matchups[h.espn_abbr][a.espn_abbr] = { p: Math.min(0.85, Math.max(0.15, 0.54 + (j - i) * 0.006)), ot: 0.22 }; }); });
let id = 0;
for (let r = 0; r < 3; r += 1) teams.forEach((h) => teams.forEach((a) => { if (h !== a && schedule.length < 1344) schedule.push({ id: String(id += 1), date: '2026-11-01T00:00Z', home: h.espn_abbr, away: a.espn_abbr, final: false }); }));
const inputs = { sport: 'nhl', teams, matchups, schedule };
const off = E.project(inputs, 1500, 3, { uncertainty: false });
const on = E.project(inputs, 1500, 3, {});
const top = (r) => Math.max(...r.teams.map((t) => t.champion));
const width = (r) => r.teams.reduce((s, t) => s + (t.points_p90 - t.points_p10), 0) / r.teams.length;
assert.ok(top(on) < top(off), 'the favourite is less certain with uncertainty');
assert.ok(width(on) > width(off), 'points ranges are wider with uncertainty');
const again = E.project(inputs, 1500, 3, {});
assert.deepStrictEqual(again.teams.map((t) => t.champion), on.teams.map((t) => t.champion), 'same seed, same answer');
process.stdout.write('SEASON_UNCERTAINTY PASSED\n');
