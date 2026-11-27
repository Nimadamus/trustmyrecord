'use strict';
/* Hand-run check for the tools A+ preview. Not a daemon. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0;
const ok = (name, cond) => { if (cond) console.log('ok ' + name); else { fail++; console.log('FAIL ' + name); } };
const home = read('index.html');
ok('homepage names four leagues', /NFL, NBA, NHL and MLB simulators/.test(home));
const hub = read('sports-simulators/index.html');
ok('hub card is not the 57 game sentence', !/57 games/.test(hub) && /103 games/.test(hub));
const season = read('mlb-season-simulator/index.html');
ok('season page does not bake Entries are closed beside an open window', !/Entries are closed/.test(season) && /2027 Season/.test(season) && /Entries open/.test(season));
const mlbHub = read('handicapping/mlb/index.html');
ok('mlb hub title is not Matchups Today', !/MLB Matchups Today/.test(mlbHub) && /2026 season is complete/i.test(mlbHub));
ok('mlb hub robots left index,follow', /index, follow/.test(mlbHub));
const nav = read('static/js/tmr-ds-nav.js');
ok('nav source calls the slate MLB Matchups', /\['\/handicapping\/mlb\/', 'MLB Matchups'\]/.test(nav) && !/\['\/handicapping\/mlb\/', 'MLB Matchups Today'\]/.test(nav));
ok('team page is not Matchups Today', !/MLB Matchups Today/.test(read('mlb-simulator/teams/athletics/index.html')));
const nfl = read('nfl-simulator/index.html');
ok('nfl served bake matches the morning ledger', /0\.2168/.test(nfl) && /0\.2007/.test(nfl) && /103 graded games/.test(nfl));
ok('nfl live paint does not run before the response', /NFL_SERVED_LIVE_20261127/.test(nfl));
ok('nfl page can show a stale reconstruction', /data-stale/.test(nfl) && /Stale reconstruction/.test(nfl));
ok('take path no longer hardcodes a null board id', !/board_game_id: null, sport: SPORT_CODE/.test(read('static/js/sim-run-gate.js')));
ok('season claims can be rewritten together', /data-entry-claim="open"/.test(season) && /rewriteEntryClaims/.test(read('static/js/season-simulator.js')));
for (const p of ['nfl-season-simulator/index.html', 'nba-season-simulator/index.html', 'nhl-season-simulator/index.html']) {
  ok(p + ' asks the live schedule', read(p).includes('lsim-live-count.js'));
}
const tools = read('tools/index.html');
ok('coin line stays hidden until a number exists', /id="betlegendProBalance" hidden/.test(tools) && /el\.hidden = false/.test(tools) && /typeof status\.balance !== 'number'/.test(tools));
ok('tools hub does not link the old hub root', !tools.includes('href="/trustmyrecord-tools/"'));
console.log(fail ? fail + ' failed' : 'tools-aplus-regression passed');
process.exit(fail ? 1 : 0);
