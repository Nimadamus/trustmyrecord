#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');

assert(!html.includes('if (pricedLegacyGames.length) games = pricedLegacyGames'), 'legacy renderer must not drop pending/unpriced games');
assert(!html.includes('if (pricedModernGames.length) games = pricedModernGames'), 'modern renderer must not drop pending/unpriced games');
assert(!reliability.includes('const displayGames = pricedGames.length ? pricedGames : normalizedGames'), 'primary renderer must not replace the full game list with only priced games');
assert(html.includes('hasPricedLegacyMarkets') && html.includes('games = games.slice().sort'), 'legacy renderer should sort priced games first while preserving all games');
assert(html.includes('hasPricedModernMarkets') && html.includes('games = games.slice().sort'), 'modern renderer should sort priced games first while preserving all games');
assert(reliability.includes('frontend_pending_games_sorted_after_priced'), 'primary renderer should report pending games sorted after priced games');
assert(reliability.includes("const BOARD_CACHE_PREFIX = 'tmr_sportsbook_board_v4_boardshape_'"), 'sportsbook board cache namespace must stay on repaired board-shape cache');
assert(reliability.includes('function extractBoardGames(response)'), 'sportsbook board runtime must normalize API board envelopes before rendering');
assert(reliability.includes('function normalizeBoardGameShape(game)'), 'sportsbook board runtime must normalize common team-name fields before dropping games');
assert(reliability.includes('const boardResponse = normalizeBoardResponse(response, sport);'), 'cached board renders must use the same normalization as fresh board responses');
assert(reliability.includes('function ensureVisibleMarketGroups(card)'), 'renderer must recover visible priced lines when a stale market filter hides the active group');
assert(/sportsbook-production-fix-persist-reliability\.js\?v=[^"']+&cb=[^"']+/.test(html), 'sportsbook page must request the repaired runtime with cache-busting params');

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
