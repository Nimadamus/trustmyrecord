'use strict';
/* LEAGUE_SIM_CONSISTENCY_20261030.
   1. Every baked NBA team page: its finished wins plus the game odds it prints
      add up to the projected wins it prints (fails on the pages baked before
      2026-10-30, which printed a pair table while the projection ran on per
      date forecasts: Sacramento 14.5 against 20.2).
   2. Season scenarios on a 30 club league (preseason, early, midseason, late,
      complete), with per-date odds that differ from the pair table: the bake
      gate passes, every club plays 82, league totals add up. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../static/js/league-season-engine.js');
const C = require('../scripts/league-sim-consistency.js');

const ROOT = path.resolve(__dirname, '..');

/* ---- 1. baked pages */
const dir = path.join(ROOT, 'nba-simulator', 'teams');
let pages = 0;
for (const slug of fs.readdirSync(dir)) {
  const f = path.join(dir, slug, 'index.html');
  if (!fs.existsSync(f)) continue;
  const r = C.checkTeamPage(fs.readFileSync(f, 'utf8'));
  if (!r) continue;
  pages += 1;
  const missing = Math.max(0, 82 - r.gamesShown);
  const gap = Math.abs(r.shown + 0.5 * missing - r.proj);
  assert.ok(gap <= 1 + 0.5 * missing,
    `${slug}: page prints ${r.proj} projected wins but its ${r.gamesShown} games add to ${r.shown.toFixed(2)} (+${missing} cup games)`);
}
assert.strictEqual(pages, 30, `30 NBA team pages carry the projection block (found ${pages})`);

/* ---- 2. scenarios */
function league(finalShare, seed) {
  const rnd = E.mulberry32(seed);
  const teams = [];
  const divs = { East: ['Atlantic', 'Central', 'Southeast'], West: ['Northwest', 'Pacific', 'Southwest'] };
  Object.entries(divs).forEach(([conf, ds]) => ds.forEach((d) => {
    for (let i = 0; i < 5; i++) teams.push({ espn_abbr: 'T' + String(teams.length).padStart(2, '0'), name: d + ' ' + i, short: d + i, conference: conf, division: d });
  }));
  const s = {}; teams.forEach((t) => { s[t.espn_abbr] = (rnd() - 0.5) * 2.4; });
  const matchups = {};
  teams.forEach((h) => { matchups[h.espn_abbr] = {}; teams.forEach((a) => {
    if (h !== a) matchups[h.espn_abbr][a.espn_abbr] = { p: 1 / (1 + Math.exp(-(0.25 + s[h.espn_abbr] - s[a.espn_abbr]))) };
  }); });
  // 80 scheduled games a club (1,200): the engine fills the 2 NBA Cup games.
  const schedule = []; let id = 0;
  const start = Date.parse('2026-10-20T23:00:00Z');
  for (let round = 0; round < 80; round++) {
    const order = teams.map((t) => t.espn_abbr);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let k = 0; k < order.length; k += 2) {
      const home = round % 2 ? order[k] : order[k + 1], away = round % 2 ? order[k + 1] : order[k];
      const g = { id: String(++id), date: new Date(start + round * 2.2 * 86400e3).toISOString(), home, away, final: false };
      const pair = matchups[home][away].p;
      // the per-date forecast differs from the pair table (rest, a back to back)
      g.p_home = Math.min(0.97, Math.max(0.03, pair + (rnd() - 0.5) * 0.12));
      if (round < 80 * finalShare) {
        const hw = rnd() < pair;
        Object.assign(g, { final: true, home_score: hw ? 110 : 100, away_score: hw ? 100 : 110, p_home: undefined });
      }
      schedule.push(g);
    }
  }
  return { sport: 'nba', season_label: '2026-27', teams, matchups, schedule };
}

for (const [label, share] of [['preseason', 0], ['early', 0.1], ['midseason', 0.5], ['late', 0.9], ['complete', 1]]) {
  const inp = league(share, 17 + Math.round(share * 10));
  const r = E.project(inp, 3000, 5);
  const problems = C.checkProjection(inp, r);
  assert.deepStrictEqual(problems, [], `${label}: ${problems.join('; ')}`);
  const rng = E.mulberry32(9);
  for (let k = 0; k < 200; k++) {
    const rec = E.simulateSeason(inp, rng);
    for (const t of Object.keys(rec)) assert.strictEqual(rec[t].gp, 82, `${label}: ${t} played ${rec[t].gp}`);
  }
  if (share === 1) {
    // a finished season is not random: projected wins are the real wins
    const { exp } = C.expectedWins(inp);
    r.teams.forEach((t) => assert.ok(Math.abs(t.wins_mean - exp[t.abbr]) <= 1.01, `complete: ${t.abbr}`));
  }
}

/* The gate must catch a projection that does not match the printed odds. */
{
  const inp = league(0.3, 4);
  const r = E.project(inp, 1500, 3);
  const pairOnly = JSON.parse(JSON.stringify(inp));
  pairOnly.schedule.forEach((g) => { if (!g.final) g.p_home = Math.min(0.99, g.p_home + 0.2); });
  assert.ok(C.checkProjection(pairOnly, r).length > 0, 'gate flags odds that disagree with the projection');
}
console.log('LEAGUE_SIM_CONSISTENCY PASSED');
