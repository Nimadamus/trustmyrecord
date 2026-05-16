#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sportsbook = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'DEVELOPMENT_RULES.md'), 'utf8');
const productSystem = fs.readFileSync(path.join(root, 'TRUSTMYRECORD_PRODUCT_UPGRADE_SYSTEM.md'), 'utf8');

assert(sportsbook.includes('function _ttIsAlternateItem'), 'Team Totals renderer must detect alternate markets');
assert(sportsbook.includes('function _ttIsMainTeamTotalItem'), 'Team Totals renderer must filter to the main team_totals market');
assert(sportsbook.includes('function _ttApplyMainLineSanity'), 'Team Totals renderer must keep Red Sox/Braves-style main-line ordering sane');
assert(sportsbook.includes('sportsbook-game-card--two-market-cols'), 'Team Totals board must use the two-market-column layout');
assert(sportsbook.includes('TEAM_TOTALS_MAIN_MARKET_PROTOCOL_20260516'), 'Team Totals permanence CSS/protocol marker must remain');
assert(!sportsbook.includes("headers: ['Team Total Over', 'Team Total Under', 'Board']"), 'Team Totals must not render the old empty Board column');
assert(!sportsbook.includes("headers: ['Team Total Over', 'Team Total Under', 'Board'],"), 'Team Totals Board header must not return');

for (const required of [
  'Sportsbook rendering must prioritize main/default lines over alternate markets',
  'Alternate lines may only appear when clearly labeled as alternate',
  'Team Totals must render from the main `team_totals` market',
  'Full team names must remain readable on desktop sportsbook boards',
  'Empty placeholder columns are not allowed in sportsbook market tables',
  'Live visual verification of the public sportsbook page is required',
]) {
  assert(productSystem.includes(required), `product protocol missing: ${required}`);
}

for (const required of [
  'Sportsbook main/default markets remain prioritized over alternates',
  'Any alternate line shown to users is clearly labeled as alternate',
  'Team Totals render from the main `team_totals` market',
  'Desktop sportsbook boards keep full team names readable',
  'Sportsbook market tables do not leave empty placeholder columns',
  'Live visual proof from the public page',
]) {
  assert(rules.includes(required), `development rules missing: ${required}`);
}

const start = sportsbook.indexOf('function _ttChooseMainLine');
const end = sportsbook.indexOf('    function _ttButton', start);
assert(start > -1 && end > start, 'could not locate Team Totals helper block');

const game = {
  away_team: 'Boston Red Sox',
  home_team: 'Atlanta Braves',
  bookmakers: [{
    markets: [
      { key: 'spreads', outcomes: [
        { name: 'Boston Red Sox', point: 1.5, price: -170 },
        { name: 'Atlanta Braves', point: -1.5, price: 140 },
      ] },
      { key: 'totals', outcomes: [{ name: 'Over', point: 8, price: -110 }, { name: 'Under', point: 8, price: -110 }] },
    ],
  }],
};

const items = [
  { selection: 'Boston Red Sox Over', selection_label: 'Boston Red Sox Over +4.5', line: 4.5, odds: 150, market_key: 'team_totals', market_type: 'team_totals', group_key: 'team_totals', source: 'sportsbook' },
  { selection: 'Boston Red Sox Under', selection_label: 'Boston Red Sox Under +4.5', line: 4.5, odds: -200, market_key: 'team_totals', market_type: 'team_totals', group_key: 'team_totals', source: 'sportsbook' },
  { selection: 'Atlanta Braves Over', selection_label: 'Atlanta Braves Over +3.5', line: 3.5, odds: -155, market_key: 'team_totals', market_type: 'team_totals', group_key: 'team_totals', source: 'sportsbook' },
  { selection: 'Atlanta Braves Under', selection_label: 'Atlanta Braves Under +3.5', line: 3.5, odds: 120, market_key: 'team_totals', market_type: 'team_totals', group_key: 'team_totals', source: 'sportsbook' },
  { selection: 'Boston Red Sox Over', selection_label: 'Boston Red Sox Alt Over +4.5', line: 4.5, odds: 115, market_key: 'alternate_team_totals', market_type: 'alternate_team_totals', group_key: 'alternate_team_totals', source: 'sportsbook' },
  { selection: 'Boston Red Sox Under', selection_label: 'Boston Red Sox Alt Under +4.5', line: 4.5, odds: -135, market_key: 'alternate_team_totals', market_type: 'alternate_team_totals', group_key: 'alternate_team_totals', source: 'sportsbook' },
];

const context = { console, game, items, result: null };
vm.createContext(context);
vm.runInContext(`${sportsbook.slice(start, end)}\nresult = _ttSplitItems(game, items);`, context, { timeout: 5000 });

assert.strictEqual(context.result.away.over.line, 3.5, 'Boston Red Sox over must resolve to the main 3.5 team total');
assert.strictEqual(context.result.away.under.line, 3.5, 'Boston Red Sox under must resolve to the main 3.5 team total');
assert.notStrictEqual(context.result.away.over.line, 4.5, 'Boston Red Sox must not silently show alternate 4.5 as default');
assert.strictEqual(context.result.home.over.line, 4.5, 'Atlanta Braves line should receive the favorite-side main total after sanity correction');

console.log('sportsbook team totals rendering regression test passed');
