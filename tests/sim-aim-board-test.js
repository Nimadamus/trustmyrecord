/**
 * Simulator aims at a live sportsbook board game (MOTD when it is on the board).
 * Never auto-runs on landing.
 *
 *   node tests/sim-aim-board-test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const nfl = read('nfl-simulator/index.html');
const mlb = read('static/js/mlb-sim-landing.js');

assert.ok(/function aimAtLiveBoard/.test(nfl), 'NFL aims at the live board');
assert.ok(/On the board/.test(nfl), 'NFL labels the lockable game');
assert.ok(!/runScheduled/.test(nfl.slice(nfl.indexOf('async function aimAtLiveBoard'), nfl.indexOf('function pickGame'))),
  'NFL aim never auto-runs');
assert.ok(/fromUrl=await runFromUrl/.test(nfl), 'shared sim links still own the page');
assert.ok(/if\(!fromUrl\)\{try\{await aimAtLiveBoard/.test(nfl), 'aim only when the URL did not pick a game');

assert.ok(/function aimSlateAtBoard/.test(mlb), 'MLB aims at slate games on the board');
assert.ok(/g\.board_game_id/.test(mlb.slice(mlb.indexOf('function aimSlateAtBoard'), mlb.indexOf('function aimSlateAtBoard') + 900)),
  'MLB only auto-loads games with a board id');
assert.ok(/quiet \? 'board_default'/.test(mlb), 'MLB default load does not steal the scroll');

const start = nfl.indexOf('function simTeamNick');
const end = nfl.indexOf('function highlightBoardGame');
const ctx = {};
ctx.window = ctx;
vm.runInNewContext(nfl.slice(start, end), ctx);

const sim = {
  home: 'Los Angeles Rams',
  away: 'New York Giants',
  status: 'upcoming',
  week: 2,
};
const board = {
  id: 'an_americanfootball_nfl_290872',
  home_team: 'Los Angeles Rams',
  away_team: 'New York Giants',
  commence_time: new Date(Date.now() + 3600000).toISOString(),
};
assert.ok(ctx.simGameOnBoard(sim, board));
assert.ok(ctx.simFeaturedPrefers(board, { matchup: 'Giants at Rams' }));

const other = {
  id: 'other',
  home_team: 'Kansas City Chiefs',
  away_team: 'Indianapolis Colts',
  commence_time: new Date(Date.now() + 7200000).toISOString(),
};
const hit = ctx.simPickBoardTarget(
  [sim, { home: 'Kansas City Chiefs', away: 'Indianapolis Colts', status: 'upcoming', week: 2 }],
  [other, board],
  { matchup: 'Giants at Rams', label: 'Monday Night Football' }
);
assert.ok(hit);
assert.strictEqual(hit.board.id, board.id);
assert.strictEqual(hit.sim.away, 'New York Giants');

const noFeat = ctx.simPickBoardTarget(
  [sim],
  [board],
  null
);
assert.ok(noFeat);
assert.strictEqual(noFeat.board.id, board.id);

const none = ctx.simPickBoardTarget(
  [{ home: 'Dallas Cowboys', away: 'Philadelphia Eagles', status: 'upcoming' }],
  [board],
  null
);
assert.strictEqual(none, null);

console.log('sim-aim-board-test: ok');
