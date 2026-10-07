'use strict';
/* series-playoff-prob-test.js -- regular-season games use p; series games use pp when present. */
const assert = require('assert');
const E = require('../static/js/league-season-engine.js');
const divs = [['A', 'Atlantic', 'Eastern'], ['M', 'Metropolitan', 'Eastern'], ['C', 'Central', 'Western'], ['P', 'Pacific', 'Western']];
const teams = []; divs.forEach(([k, div, conf]) => { for (let i = 0; i < 8; i += 1) teams.push({ espn_abbr: k + i, name: k + i, short: k + i, conference: conf, division: div }); });
const matchups = {};
teams.forEach((h) => { matchups[h.espn_abbr] = {}; teams.forEach((a) => { if (h !== a) matchups[h.espn_abbr][a.espn_abbr] = { p: 0.5, ot: 0.22 }; }); });
// A0 is a coin flip in the regular season but wins every playoff game.
teams.forEach((t) => { if (t.espn_abbr !== 'A0') { matchups.A0[t.espn_abbr].pp = 0.99; matchups[t.espn_abbr].A0.pp = 0.01; } });
const schedule = []; let id = 0;
teams.forEach((h) => teams.forEach((a) => { if (h !== a && schedule.length < 1000) schedule.push({ id: String(id += 1), date: '2026-11-01T00:00Z', home: h.espn_abbr, away: a.espn_abbr, final: false }); }));
const r = E.project({ sport: 'nhl', teams, matchups, schedule }, 2000, 5, { uncertainty: false });
const a0 = r.teams.find((t) => t.abbr === 'A0');
const others = r.teams.filter((t) => t.abbr !== 'A0');
const avgWins = others.reduce((s, t) => s + t.wins_mean, 0) / others.length;
assert.ok(Math.abs(a0.wins_mean - avgWins) < 3, 'regular season: A0 is an ordinary team (uses p, not pp)');
assert.ok(a0.playoffs > 0.2 && a0.playoffs < 0.9, 'qualification is ordinary');
const condChamp = a0.champion / a0.playoffs;
assert.ok(condChamp > 0.85, 'once in, A0 wins the Cup almost every time: series games use pp (' + condChamp.toFixed(3) + ')');
process.stdout.write('SERIES_PLAYOFF_PROB PASSED\n');
