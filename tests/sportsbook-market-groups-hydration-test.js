#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');

const helperStart = html.indexOf('    window.TMR._hydrateLegacyBookmakersFromMarketGroups = function(game) {');
const helperEnd = html.indexOf('    // ===== Renderer for non-Game markets', helperStart);
assert(helperStart !== -1 && helperEnd !== -1, 'market_groups hydration helper must be extractable');

const context = {
  window: {
    TMR: {},
  },
  Number,
  Date,
};
vm.createContext(context);
vm.runInContext(html.slice(helperStart, helperEnd), context);

const game = {
  id: 'mlb-test',
  sport_key: 'baseball_mlb',
  updated_at: '2026-05-08T18:00:00.000Z',
  home_team: 'San Diego Padres',
  away_team: 'St. Louis Cardinals',
  bookmakers: [],
  market_groups: [
    {
      key: 'full_game',
      items: [
        { source: 'sportsbook', market_type: 'h2h', market_key: 'h2h', selection: 'St. Louis Cardinals', odds: 118, book_title: 'DraftKings', book_key: 'draftkings' },
        { source: 'sportsbook', market_type: 'h2h', market_key: 'h2h', selection: 'San Diego Padres', odds: -140 },
      ],
    },
    {
      key: 'spread',
      items: [
        { source: 'sportsbook', market_type: 'spreads', market_key: 'spreads', selection: 'St. Louis Cardinals', line: 1.5, odds: -178 },
        { source: 'sportsbook', market_type: 'spreads', market_key: 'spreads', selection: 'San Diego Padres', line: -1.5, odds: 150 },
      ],
    },
    {
      key: 'total',
      items: [
        { source: 'sportsbook', market_type: 'totals', market_key: 'totals', selection: 'Over', selection_label: 'Over 7.5', line: 7.5, odds: -105 },
        { source: 'sportsbook', market_type: 'totals', market_key: 'totals', selection: 'Under', selection_label: 'Under 7.5', line: 7.5, odds: -115 },
      ],
    },
    {
      key: 'first_5',
      items: [
        { source: 'sportsbook', market_type: 'f5_spreads', selection: 'St. Louis Cardinals', line: 0.5, odds: -120 },
        { source: 'sportsbook', market_type: 'f5_h2h', selection: 'San Diego Padres', odds: -130 },
        { source: 'sportsbook', market_type: 'f5_totals', selection: 'Over', line: 4.5, odds: 100 },
      ],
    },
    {
      key: 'team_totals',
      items: [
        { source: 'sportsbook', market_type: 'team_totals', selection: 'San Diego Padres Over', selection_label: 'San Diego Padres Over 4.5', line: 4.5, odds: -125 },
      ],
    },
  ],
};

context.window.TMR._hydrateLegacyBookmakersFromMarketGroups(game);

assert.strictEqual(game.bookmakers.length, 1, 'hydrator should create one legacy bookmaker');
assert.strictEqual(game.bookmakers[0].key, 'draftkings', 'hydrator should preserve first real book key');

const markets = new Map(game.bookmakers[0].markets.map((market) => [market.key, market]));
const ownArray = (value) => JSON.parse(JSON.stringify(value));
assert.deepStrictEqual(ownArray(markets.get('h2h').outcomes.map((outcome) => outcome.price)), [118, -140], 'moneyline odds hydrate');
assert.deepStrictEqual(ownArray(markets.get('spreads').outcomes.map((outcome) => outcome.point)), [1.5, -1.5], 'spread lines hydrate');
assert.deepStrictEqual(ownArray(markets.get('totals').outcomes.map((outcome) => `${outcome.name} ${outcome.point} ${outcome.price}`)), ['Over 7.5 -105', 'Under 7.5 -115'], 'total sides hydrate');
assert.strictEqual(markets.get('f5_spreads').outcomes[0].price, -120, 'F5 spread odds hydrate');
assert.strictEqual(markets.get('f5_h2h').outcomes[0].price, -130, 'F5 moneyline odds hydrate');
assert.strictEqual(markets.get('f5_totals').outcomes[0].point, 4.5, 'F5 total line hydrates');
assert.deepStrictEqual(ownArray(markets.get('team_totals').outcomes[0]), {
  description: 'San Diego Padres',
  name: 'Over',
  point: 4.5,
  price: -125,
}, 'team total outcome hydrates with team description');

console.log('sportsbook market_groups hydration test passed');
