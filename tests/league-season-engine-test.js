'use strict';
/* NBA_NHL_SEASON_ENGINE_20260915: invariants of the NBA and NHL season and
   playoff engine on a synthetic league, offline. */
const assert = require('assert');
const E = require('../static/js/league-season-engine.js');

function league(sport) {
  const confs = sport === 'nhl' ? { East: ['A', 'B'], West: ['C', 'D'] } : { East: ['A', 'B', 'C'], West: ['D', 'E', 'F'] };
  const per = sport === 'nhl' ? 8 : 5;
  const teams = [];
  Object.entries(confs).forEach(([c, divs]) => divs.forEach((d) => {
    for (let i = 0; i < per; i++) teams.push({ espn_abbr: d + i, name: 'Team ' + d + i, short: d + i, conference: c, division: d });
  }));
  const strength = {}; teams.forEach((t, i) => { strength[t.espn_abbr] = (i % 7) / 7; });
  const matchups = {};
  teams.forEach((h) => { matchups[h.espn_abbr] = {}; teams.forEach((a) => {
    if (h === a) return;
    const p = Math.min(0.9, Math.max(0.1, 0.55 + (strength[h.espn_abbr] - strength[a.espn_abbr]) * 0.5));
    matchups[h.espn_abbr][a.espn_abbr] = sport === 'nhl' ? { p, ot: 0.22 } : { p };
  }); });
  const schedule = []; let id = 0;
  const target = sport === 'nba' ? 80 : sport === 'mlb' ? 162 : 84;
  for (let round = 0; schedule.length < teams.length * target / 2; round++) {
    for (let i = 0; i < teams.length && schedule.length < teams.length * target / 2; i++) {
      const h = teams[i], a = teams[(i + 1 + round) % teams.length];
      if (h === a) continue;
      schedule.push({ id: String(++id), date: '2026-10-01T00:00Z', home: h.espn_abbr, away: a.espn_abbr, final: false });
    }
  }
  schedule[0].final = true; schedule[0].home_score = 3; schedule[0].away_score = 2; schedule[0].extra_time = true;
  return { sport, teams, matchups, schedule };
}

for (const sport of ['nba', 'nhl', 'mlb']) {
  const inp = league(sport);
  const r = E.project(inp, 400, 7);
  const sum = (k) => r.teams.reduce((s, t) => s + t[k], 0);
  assert.ok(Math.abs(sum('champion') - 1) < 1e-9, `${sport} one champion per season`);
  assert.ok(Math.abs(sum('final') - 2) < 1e-9, `${sport} two finalists`);
  assert.ok(Math.abs(sum('conf_final') - 4) < 1e-9, `${sport} four conference finalists`);
  assert.ok(Math.abs(sum('round2') - 8) < 1e-9, `${sport} eight second round teams`);
  assert.ok(Math.abs(sum('playoffs') - (sport === 'mlb' ? 12 : 16)) < 1e-9, `${sport} playoff field size`);
  if (sport === 'mlb') { assert.ok(Math.abs(sum('division_title') - 6) < 1e-9, 'mlb six division winners'); assert.ok(Math.abs(sum('direct') - 4) < 1e-9, 'mlb four byes'); }
  if (sport === 'nba') assert.ok(Math.abs(sum('play_in') - 8) < 1e-9, 'nba eight play-in teams');
  if (sport === 'nhl') assert.ok(Math.abs(sum('division_title') - 4) < 1e-9, 'nhl four division winners');
  r.teams.forEach((t) => {
    assert.ok(t.champion <= t.final + 1e-9 && t.final <= t.conf_final + 1e-9 && t.conf_final <= t.round2 + 1e-9 && t.round2 <= t.playoffs + 1e-9, `${sport} ${t.abbr} rounds are nested`);
    assert.ok(t.wins_p10 <= t.wins_mean && t.wins_mean <= t.wins_p90, `${sport} ${t.abbr} range brackets the mean`);
  });
  const one = E.runOnce(inp, E.mulberry32(3));
  const gp = Object.values(one.records).map((x) => x.gp);
  if (sport === 'nba') assert.ok(Math.max(...gp) <= 82, 'nba never more than 82 games');
  else if (sport === 'nhl') assert.ok(gp.every((g) => g === gp[0]), 'nhl every club plays the same count on a balanced schedule');
  /* The final game is locked: across seeds the home side always has that win. */
  const g0 = inp.schedule[0];
  for (let s = 1; s < 20; s++) {
    const rec = E.simulateSeason(inp, E.mulberry32(s));
    const h = rec[g0.home].h2h[g0.away];
    assert.ok(h && h.w >= 1, `${sport} a final result is never resimulated`);
  }
  /* Stronger clubs win more on average. */
  const byStrength = r.teams.slice().sort((a, b) => b.wins_mean - a.wins_mean);
  assert.ok(byStrength[0].wins_mean > byStrength[byStrength.length - 1].wins_mean + 5, `${sport} ratings move the standings`);
  /* Same seed, same projection. */
  assert.deepStrictEqual(E.project(inp, 50, 11).teams.map((t) => t.champion), E.project(inp, 50, 11).teams.map((t) => t.champion));
}
console.log('LEAGUE_SEASON_ENGINE PASSED');
