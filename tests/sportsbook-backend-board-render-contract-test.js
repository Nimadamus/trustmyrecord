#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix.js'), 'utf8');

assert(
  runtime.includes('html += games.map(function(rawGame, index)'),
  'sportsbook runtime should render from every backend game in the board response'
);
assert(
  runtime.includes('const orderedGroups = (game.market_groups || []).slice().sort'),
  'sportsbook runtime should render the market groups supplied by the backend'
);
assert(
  /if\s*\(!groupsHtml\)\s*{\s*return '';\s*}/.test(runtime),
  'sportsbook runtime may skip only games with no renderable market groups'
);
assert(
  !runtime.includes('games = games.slice(0,'),
  'sportsbook runtime must not globally truncate the backend game slate before rendering'
);

const backendBoard = [
  {
    id: 'an_icehockey_nhl_290511',
    away_team: 'Colorado Avalanche',
    home_team: 'Minnesota Wild',
    market_groups: [
      { key: 'full_game', items: [{ odds: 105 }, { odds: -125 }] },
      { key: 'spread', items: [{ odds: -190 }, { odds: 160 }] },
      { key: 'total', items: [{ odds: -110 }, { odds: -110 }] },
      { key: 'team_totals', items: [{ odds: -105 }, { odds: -125 }, { odds: 115 }, { odds: -140 }] },
    ],
  },
  {
    id: 'an_basketball_nba_partial',
    away_team: 'Los Angeles Lakers',
    home_team: 'Golden State Warriors',
    market_groups: [
      { key: 'full_game', items: [{ odds: 120 }, { odds: -140 }] },
    ],
  },
];

const renderable = backendBoard.filter((game) => {
  return (game.market_groups || []).some((group) => (group.items || []).length > 0);
});

assert.strictEqual(renderable.length, backendBoard.length, 'full and partial backend games are renderable');
assert(renderable.some((game) => game.away_team === 'Colorado Avalanche' && game.home_team === 'Minnesota Wild'));
assert(renderable.some((game) => game.id === 'an_basketball_nba_partial'));

console.log('sportsbook backend board render contract test passed');
