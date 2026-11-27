'use strict';
const assert = require('assert');
const B = require('../static/js/sim-board-match.js');

const games = [
  { id: 'g-ok', home_team: 'Boston Celtics', away_team: 'New York Knicks' },
  { id: 'g-other', home_team: 'Los Angeles Lakers', away_team: 'Golden State Warriors' },
];
assert.strictEqual(B.uniqueBoardGame(games, 'Boston Celtics', 'New York Knicks').id, 'g-ok');
assert.strictEqual(B.uniqueBoardGame(games.concat([{ id: 'g-2', home_team: 'Boston Celtics', away_team: 'New York Knicks' }]), 'Boston Celtics', 'New York Knicks').id, null);
assert.strictEqual(B.uniqueBoardGame(games, 'Miami Heat', 'Chicago Bulls').id, null);

const intent = { board_game_id: 'g-other', home_team_name: 'Boston Celtics', away_team_name: 'New York Knicks', pick_team: 'Boston Celtics', market: 'h2h' };
assert.strictEqual(B.prefillIndex(games, intent), -1);
const good = Object.assign({}, intent, { board_game_id: 'g-ok' });
assert.strictEqual(B.prefillIndex(games, good), 0);
const noId = { home_team_name: 'Boston Celtics', away_team_name: 'New York Knicks' };
assert.strictEqual(B.prefillIndex(games, noId), 0);
assert.strictEqual(B.prefillIndex(games.concat([{ id: 'g-2', home_team: 'Boston Celtics', away_team: 'New York Knicks' }]), noId), -1);

const built = B.intentFor('Boston Celtics', 'Boston Celtics', 'New York Knicks', games, 'NBA', 'nba-simulator');
assert.strictEqual(built.board_game_id, 'g-ok');
assert.strictEqual(built.market, 'h2h');
assert.strictEqual(built.selection, 'Boston Celtics');
assert.strictEqual(built.sport, 'NBA');

const nhl = [
  { id: 'fri', home_team: 'Anaheim Ducks', away_team: 'Los Angeles Kings' },
  { id: 'sat', home_team: 'Los Angeles Kings', away_team: 'Anaheim Ducks' },
];
assert.strictEqual(B.intentFor('Anaheim Ducks', 'Anaheim Ducks', 'Los Angeles Kings', nhl, 'NHL', 'nhl-simulator').board_game_id, 'fri');
assert.strictEqual(B.intentFor('Los Angeles Kings', 'Los Angeles Kings', 'Anaheim Ducks', nhl, 'NHL', 'nhl-simulator').board_game_id, 'sat');
assert.strictEqual(B.prefillIndex(nhl, { board_game_id: 'sat', home_team_name: 'Anaheim Ducks', away_team_name: 'Los Angeles Kings', pick_team: 'Anaheim Ducks', market: 'h2h' }), -1);
assert.strictEqual(B.uniqueBoardGame(nhl.concat([{ id: 'fri2', home_team: 'Anaheim Ducks', away_team: 'Los Angeles Kings' }]), 'Anaheim Ducks', 'Los Angeles Kings').id, null);

console.log('sim-board-id-test passed');
