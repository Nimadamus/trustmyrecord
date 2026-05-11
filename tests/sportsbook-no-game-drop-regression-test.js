#!/usr/bin/env node



const assert = require('assert');

const fs = require('fs');

const path = require('path');



const root = path.resolve(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');

const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');



assert(

  !reliability.includes('const displayGames = pricedGames.length ? pricedGames : normalizedGames'),

  'primary reliability renderer must not replace the full game list with only priced games'

);

assert(

  reliability.includes('frontend_pending_games_sorted_after_priced'),

  'primary reliability renderer should report pending games sorted after priced games'

);

assert(
  reliability.includes("const BOARD_CACHE_PREFIX = 'tmr_sportsbook_board_v5_livegames_'"),
  'sportsbook board cache namespace must be bumped after odds/game visibility repairs'
);
assert(
  reliability.includes("LEGACY_BOARD_CACHE_PREFIXES = ['tmr_sportsbook_board_v2_', 'tmr_sportsbook_board_v3_oddsrepair_', 'tmr_sportsbook_board_v4_boardshape_']"),
  'sportsbook runtime must clear stale board caches from broken v2/v3/v4 namespaces'
);
assert(
  html.includes('sportsbook-production-fix-persist-reliability.js?v=20260511compactrows1&cb=20260511compactrows1'),
  'sportsbook page must request the compact aligned-row reliability runtime, not a stale cached script'
);
assert(
  !html.includes('if (!sportKey || !window.TMR.fetchGamesFromESPN)'),
  'sportsbook lobby must not block the backend board just because the ESPN fallback helper is unavailable'
);
assert(
  html.includes('if (!window.TMR.fetchGamesFromESPN)') &&
    html.indexOf('fetch(url, { headers: {') < html.indexOf('espnFallback(); return;'),
  'sportsbook lobby should try the backend board before falling back to ESPN'
);
assert(
  html.includes('tmr-redesign-overrides-sportsbook.css?v=20260509logorestore1'),
  'sportsbook page must request the logo-restored stylesheet, not stale cached CSS'
);
assert(
  html.includes('window.TMR.fetchGamesFromESPN = function(sportKey, callback)'),
  'sportsbook page must keep the ESPN game fallback path wired'
);
assert(
  html.includes('var maxDays = 7;') &&
    html.includes('/scoreboard?dates=') &&
    html.includes('tryFetch(daysOffset + 1);'),
  'ESPN fallback must keep pinned-date scoreboard requests and 7-day lookahead for upcoming games'
);
assert(
  html.includes('gameStart.getTime() <= nowTime'),
  'ESPN fallback must continue excluding already-started games from the pick board'
);
assert(
  html.includes('Never synthesize betting lines') &&
    html.includes('window.TMR.fetchOddsFromSummary(games, espnPath') &&
    html.includes('callback(enrichedGames, daysOffset > 0 ? daysOffset : null);'),
  'ESPN fallback must enrich missing real odds from summary endpoints without inventing lines'
);
assert(
  reliability.includes('function extractBoardGames(response)'),
  'sportsbook board runtime must normalize API board envelopes before rendering'
);
assert(
  reliability.includes('response.data && response.data.games') &&
    reliability.includes('response.board && response.board.games') &&
    reliability.includes('response.result && response.result.games'),
  'sportsbook board runtime must preserve games from common nested API response shapes'
);
assert(
  reliability.includes('function normalizeBoardGameShape(game)') &&
    reliability.includes('game.homeTeam') &&
    reliability.includes('game.awayTeam') &&
    reliability.includes('game.competitors'),
  'sportsbook board runtime must normalize common team-name fields before dropping games'
);
assert(
  reliability.includes('const boardResponse = normalizeBoardResponse(response, sport);') &&
    reliability.includes('state.currentBoard = boardResponse.games || [];'),
  'cached board renders must use the same normalization as fresh board responses'
);
assert(
  reliability.includes('function ensureVisibleMarketGroups(card)') &&
    reliability.includes("card.dataset.marketFilter = fallbackFilter") &&
    reliability.includes("group.getAttribute('data-category') === 'game-lines'"),
  'sportsbook board renderer must recover visible priced lines when a stale market filter hides the active group'
);


const fixture = [

  { id: 'pending-a', commence_time: '2026-05-09T01:00:00Z', priced: false },

  { id: 'priced-b', commence_time: '2026-05-09T02:00:00Z', priced: true },

  { id: 'pending-c', commence_time: '2026-05-09T03:00:00Z', priced: false },

  { id: 'priced-d', commence_time: '2026-05-09T04:00:00Z', priced: true },

];

const sorted = fixture.slice().sort((a, b) => {

  const aPriced = a.priced ? 0 : 1;

  const bPriced = b.priced ? 0 : 1;

  if (aPriced !== bPriced) return aPriced - bPriced;

  return new Date(a.commence_time) - new Date(b.commence_time);

});



assert.strictEqual(sorted.length, fixture.length, 'priced-first sorting must preserve game count');

assert.deepStrictEqual(sorted.map((game) => game.id), ['priced-b', 'priced-d', 'pending-a', 'pending-c']);



console.log('sportsbook no-game-drop regression test passed');
