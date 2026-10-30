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
/* NBA_SEASON_UNCERTAINTY_20261030: the NBA projection carries rating
   uncertainty too (sigma 0.5, fitted walk forward). Without it the 80% win
   ranges held 58% of final totals over four seasons. Scheduled NBA games carry
   their own p_home, and the offset must reach them as well. */
const nba = { sport: 'nba', teams: teams.map((t) => Object.assign({}, t)), matchups,
  schedule: schedule.slice(0, 1230).map((g, i) => Object.assign({}, g, { p_home: 0.5 + ((i % 7) - 3) * 0.05 })) };
const nOff = E.project(nba, 1500, 5, { uncertainty: false });
const nOn = E.project(nba, 1500, 5, {});
const wWidth = (r) => r.teams.reduce((s, t) => s + (t.wins_p90 - t.wins_p10), 0) / r.teams.length;
assert.ok(wWidth(nOn) > wWidth(nOff) * 1.4, `NBA win ranges widen with rating uncertainty (${wWidth(nOff).toFixed(1)} -> ${wWidth(nOn).toFixed(1)})`);
/* SIM_COPY_UNCERTAINTY_20261030: the NHL copy said its ranges cover "the luck of the
   schedule only" although the NHL season sim has carried rating noise since 10/07. The
   page copy must say what the engine does, in the same terms as the NBA/NFL wording. */
const fs = require('fs');
const path = require('path');
const B = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build_league_sim_pages.js'), 'utf8');
assert.ok(!/luck of the schedule only/i.test(B) && !/not the chance that the ratings themselves are wrong/i.test(B), 'no season copy may claim schedule-luck-only ranges');
const nhlU = (B.match(/const nhlUncertainty = `([^`]*)`/) || [])[1] || '';
assert.ok(/luck of the schedule/.test(nhlU) && /rating is off/.test(nhlU), 'NHL uncertainty copy names both schedule luck and rating uncertainty');
process.stdout.write('SEASON_UNCERTAINTY PASSED\n');
