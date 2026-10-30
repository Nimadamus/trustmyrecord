/* MLB_SEASON_STATE_20261030 -- bake gate: MLB pages must agree with
 * data/mlb-season-state.json.
 *
 * Oct 29, 2026: the Brewers won the World Series and /mlb-playoff-odds/ still
 * said "0 clubs are still alive ... the Milwaukee Brewers win the World Series
 * better than 99% of the time" with a "Run the rest of the season" button, while
 * the hub and playoff page kept selling bracket locks. This gate fails a bake
 * whose pages claim simulations of a finished season, show >99% / <1% for a
 * settled outcome, or still promote the retired JustBet contest.
 *
 * Run: node tests/mlb-season-state-gate-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SS = require('../scripts/mlb_season_state.js');
const { PAGES } = require('../scripts/build_mlb_season_pages.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); } };

/* 1. The champion rule, on a frozen copy of the real 2026 World Series. */
const T = (id) => ({ team: { id } });
const g = (date, away, as, home, hs) => ({ gameDate: date, status: { abstractGameState: 'Final' },
  teams: { away: { ...T(away), score: as }, home: { ...T(home), score: hs } } });
const teams = { 158: { abbreviation: 'MIL', name: 'Milwaukee Brewers', teamName: 'Brewers' }, 139: { abbreviation: 'TB', name: 'Tampa Bay Rays', teamName: 'Rays' } };
const ws2026 = [g('2026-10-24T00:00:00Z', 139, 2, 158, 3), g('2026-10-25T00:00:00Z', 139, 4, 158, 5),
  g('2026-10-27T00:00:00Z', 158, 10, 139, 1), g('2026-10-28T00:00:00Z', 158, 3, 139, 4), g('2026-10-29T00:00:00Z', 158, 4, 139, 1)];
const won = SS.worldSeriesResult(ws2026, teams);
ok('2026 World Series fixture: Brewers win 4 games to 1', won && won.champion.abbr === 'MIL' && won.games.join('-') === '4-1' && won.runner_up.abbr === 'TB');
ok('a series at 3 to 1 has no champion yet', SS.worldSeriesResult(ws2026.slice(0, 4), teams) === null);
ok('a scheduled game is not a win', SS.worldSeriesResult(ws2026.slice(0, 4).concat([{ ...ws2026[4], status: { abstractGameState: 'Preview' } }]), teams) === null);

/* 2. The built pages agree with the state file. */
const state = SS.readState(ROOT);
ok('data/mlb-season-state.json exists', !!state);
const done = SS.isComplete(state);
const odds = read('mlb-playoff-odds/index.html');
const teamDir = path.join(ROOT, 'mlb-simulator', 'teams');
const teamPages = fs.existsSync(teamDir) ? fs.readdirSync(teamDir).filter((d) => fs.existsSync(path.join(teamDir, d, 'index.html'))).map((d) => `mlb-simulator/teams/${d}/index.html`) : [];
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
if (done) {
  const c = state.champion.name;
  const STALE = [/better than 99%/, /under 1%/, /&gt;99%/, /&lt;1%/, /Run the rest of the season/, /id="runSim"/,
    /simulations of the rest of the postseason/, /clubs are still alive/, /every game left simulated/];
  const bad = (html) => STALE.filter((re) => re.test(text(html))).map(String);
  ok(`/mlb-playoff-odds/ states the ${state.season} season is complete and names the ${c}`, odds.includes(`${state.season} season complete`) && odds.includes(c));
  ok('/mlb-playoff-odds/ presents no simulation of the finished season and no >99% / <1%', !bad(odds).length, bad(odds).join(', '));
  ok('/mlb-playoff-odds/ meta description is the final result, not live odds', /<meta name="description" content="[^"]*final/.test(odds) && !/<meta name="description" content="Live /.test(odds));
  ok(`/mlb-playoff-odds/ shows the ${c} at exactly 100% to win it all`, /100%<\/td><\/tr>/.test(odds));
  if (state.next_opening_day) ok('/mlb-playoff-odds/ gives the next Opening Day', odds.includes(SS.ptLongDate(state.next_opening_day)));
  const staleTeams = teamPages.filter((f) => bad(read(f)).length);
  ok(`${teamPages.length} team pages show no >99% / <1% or simulation of games left`, teamPages.length === 30 && !staleTeams.length, staleTeams.slice(0, 3).join(', '));
  for (const d of PAGES) {
    const html = read(`${d}/index.html`);
    const m = html.match(/<!--MK:mlbSeasonState-->([\s\S]*?)<!--\/MK:mlbSeasonState-->/);
    ok(`/${d}/ carries the season complete banner naming the ${c}`, !!m && m[1].includes(c) && m[1].includes(`${state.season} season complete`));
    ok(`/${d}/ hides its in-season calls to action`, !!m && m[1].includes('[data-mlb-season-only]{display:none'));
  }
} else {
  for (const d of PAGES) {
    const m = read(`${d}/index.html`).match(/<!--MK:mlbSeasonState-->([\s\S]*?)<!--\/MK:mlbSeasonState-->/);
    ok(`/${d}/ has an empty season block while the season is live`, !!m && m[1] === '');
  }
}

/* 3. The retired contest is not promoted from the simulators or the shared nav. */
const CONTEST = /href="\/(contests\/justbet-mlb|free-sports-betting-contest)\//;
for (const f of PAGES.map((d) => `${d}/index.html`).concat(['mlb-playoff-odds/index.html'], teamPages)) {
  if (CONTEST.test(read(f))) ok(`${f} links the retired contest`, false);
}
ok('no MLB simulator page links the retired contest', true);
ok('shared nav (tmr-ds-nav.js) no longer lists the contest', !/'\/contests\/justbet-mlb\/'/.test(read('static/js/tmr-ds-nav.js')));
ok('shared nav (tmr-sitewide.js) no longer lists the contest', !/"\/contests\/justbet-mlb\/"/.test(read('static/js/tmr-sitewide.js')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
