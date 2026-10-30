'use strict';
/**
 * LEAGUE_SIM_CONSISTENCY_20261030 -- the bake gate for the NBA and NHL season
 * cluster. A page may only go out if the numbers it prints agree with each
 * other:
 *
 *   1. every team's projected wins equal its finished wins plus the sum of the
 *      game odds the team page prints for its remaining games (plus the
 *      expected wins from the NBA Cup games the engine fills in), within
 *      WIN_TOL. The pages once printed a pair table while the projection ran
 *      on per-date forecasts (Sacramento 14.5 wins one way, 20.2 the other);
 *   2. league totals add up: wins to games played, one champion, two
 *      finalists, sixteen playoff teams, a play-in of eight (NBA).
 *
 * Used by scripts/build_league_sim_pages.js (fail closed: nothing is written)
 * and by tests/league-sim-consistency-test.js.
 */
const E = require('../static/js/league-season-engine.js');

const WIN_TOL = 0.75;

function expectedWins(inputs) {
  const exp = {};
  const sched = {};
  inputs.teams.forEach((t) => { exp[t.espn_abbr] = 0; sched[t.espn_abbr] = 0; });
  for (const g of inputs.schedule) {
    if (!(g.home in exp) || !(g.away in exp)) continue;
    sched[g.home] += 1; sched[g.away] += 1;
    if (g.final && g.home_score != null && g.away_score != null && g.home_score !== g.away_score) {
      exp[g.home_score > g.away_score ? g.home : g.away] += 1;
      continue;
    }
    const p = E.gameProb(inputs, g).p;
    exp[g.home] += p; exp[g.away] += 1 - p;
  }
  if (inputs.sport === 'nba') {
    // Unscheduled NBA Cup games: a random conference opponent, home or away.
    for (const t of inputs.teams) {
      const missing = E.NBA_GAMES - sched[t.espn_abbr];
      if (missing <= 0) continue;
      const opp = inputs.teams.filter((o) => o.conference === t.conference && o.espn_abbr !== t.espn_abbr);
      const m = opp.reduce((s, o) => s + 0.5 * (E.gameProb(inputs, { home: t.espn_abbr, away: o.espn_abbr }).p
        + 1 - E.gameProb(inputs, { home: o.espn_abbr, away: t.espn_abbr }).p), 0) / opp.length;
      exp[t.espn_abbr] += missing * m;
    }
  }
  return { exp, sched };
}

function checkProjection(inputs, result) {
  const problems = [];
  const sport = inputs.sport;
  const n = inputs.teams.length;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const sum = (k) => result.teams.reduce((s, t) => s + (t[k] || 0), 0);
  if (result.teams.length !== n) problems.push(`projection has ${result.teams.length} teams, inputs ${n}`);
  const { exp } = expectedWins(inputs);
  for (const t of result.teams) {
    if (!(t.abbr in exp)) { problems.push(`${t.abbr}: not in the inputs`); continue; }
    if (!near(t.wins_mean, exp[t.abbr], WIN_TOL)) {
      problems.push(`${t.abbr}: projected ${t.wins_mean.toFixed(2)} wins but the printed game odds add to ${exp[t.abbr].toFixed(2)}`);
    }
  }
  const games = sport === 'nba' ? n * E.NBA_GAMES / 2 : inputs.schedule.length;
  if (sport === 'nba' && !near(sum('wins_mean'), games, 0.5)) problems.push(`league wins ${sum('wins_mean').toFixed(2)} != ${games} games`);
  const want = { champion: 1, final: 2, conf_final: 4, round2: 8, playoffs: 16 };
  if (sport === 'nba') Object.assign(want, { play_in: 8, direct: 12 });
  for (const [k, v] of Object.entries(want)) if (!near(sum(k), v, 1e-6)) problems.push(`${k} odds add to ${sum(k).toFixed(4)}, not ${v}`);
  for (const t of result.teams) {
    for (const k of ['playoffs', 'champion', 'final', 'division_title']) {
      if (!(t[k] >= 0 && t[k] <= 1)) problems.push(`${t.abbr}: ${k} = ${t[k]}`);
    }
    if (t.champion > t.final + 1e-9 || t.final > t.conf_final + 1e-9 || t.conf_final > t.round2 + 1e-9 || t.round2 > t.playoffs + 1e-9) {
      problems.push(`${t.abbr}: round odds not monotone`);
    }
  }
  return problems;
}

/* The same check against a BAKED team page: the "% to win" cells and final
   results the page shows, against the projected wins it prints. */
function checkTeamPage(html) {
  const block = (html.match(/<!--MK:leagueSimTeam-->([\s\S]*?)<!--\/MK:leagueSimTeam-->/) || [])[1];
  if (!block) return null;
  const proj = Number((block.match(/<b>([0-9.]+)<\/b><span>projected wins<\/span>/) || [])[1]);
  const gamesShown = Number((block.match(/All (\d+) games\./) || [])[1]);
  let won = 0, odds = 0;
  for (const m of block.matchAll(/<td style="text-align:right">([^<]*(?:<b[^>]*>[^<]*<\/b>)?[^<]*)<\/td>/g)) {
    const cell = m[1];
    const pct = cell.match(/(\d+)% to win/);
    if (pct) odds += Number(pct[1]) / 100;
    else if (/>W \d+/.test(cell)) won += 1;
  }
  return { proj, gamesShown, won, odds, shown: won + odds };
}

module.exports = { WIN_TOL, expectedWins, checkProjection, checkTeamPage };
