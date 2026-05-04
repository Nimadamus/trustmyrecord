#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'mlb-simulator', 'index.html');
const scriptPath = path.join(root, 'static', 'js', 'mlb-simulator.js');

assert(fs.existsSync(pagePath), '/mlb-simulator/ page exists');
assert(fs.existsSync(scriptPath), 'MLB simulator client script exists');

const html = fs.readFileSync(pagePath, 'utf8');
const script = fs.readFileSync(scriptPath, 'utf8');

assert(/<link rel="canonical" href="https:\/\/trustmyrecord\.com\/mlb-simulator\/">/.test(html), 'canonical route is /mlb-simulator/');
assert(/\/static\/js\/backend-api\.js/.test(html), 'page loads shared API client');
assert(/\/static\/js\/mlb-simulator\.js/.test(html), 'page loads simulator script');
assert(/Projection engine not connected yet/.test(html), 'page clearly labels unconnected projection engine');
assert(!/pending picks/i.test(html), 'page does not expose pending picks language');
assert(!/lock pick|locked pick|submit pick/i.test(html), 'page does not expose sportsbook submission actions');
assert(!/\b\d+\s*-\s*\d+\b/.test(html.replace(/2026|404/g, '')), 'page does not hard-code projected scores');
assert(!/\b\d+(\.\d+)?%/.test(html), 'page does not hard-code win probability percentages');

function makeElement(id) {
  return {
    id,
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
  };
}

function makeContext(boardResponse) {
  const elements = {};
  [
    'mlbMatchupSelect',
    'refreshMlbBoard',
    'simBoardMessage',
    'simDataSourceTitle',
    'simDataSourceDetail',
    'selectedMatchupTitle',
    'awayTeamName',
    'homeTeamName',
    'gameTimeLabel',
    'marketCountLabel',
    'marketGroups',
    'boardInputStatus',
  ].forEach((id) => { elements[id] = makeElement(id); });

  const calls = [];
  const context = {
    window: {
      api: {
        ready: Promise.resolve(),
        async getMarketBoard(sportKey) {
          calls.push({ method: 'getMarketBoard', sportKey });
          return boardResponse;
        },
      },
    },
    document: {
      readyState: 'complete',
      getElementById(id) {
        return elements[id] || null;
      },
      addEventListener() {},
    },
    console,
    setTimeout,
    clearTimeout,
    Date,
    Number,
  };
  context.window.document = context.document;
  return { context, elements, calls };
}

async function tick() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

async function main() {
  const board = {
    summary: { message: '1/1 games are showing sportsbook-backed markets.' },
    games: [{
      id: 'game_1',
      sport_key: 'baseball_mlb',
      away_team: 'Seattle Mariners',
      home_team: 'Texas Rangers',
      commence_time: '2026-05-05T01:00:00Z',
      market_groups: [{
        key: 'full_game',
        label: 'Full Game',
        items: [
          { market_type: 'h2h', selection_label: 'Seattle Mariners ML', selection: 'Seattle Mariners', odds: 120, book_title: 'DraftKings' },
          { market_type: 'h2h', selection_label: 'Texas Rangers ML', selection: 'Texas Rangers', odds: -140, book_title: 'DraftKings' },
        ],
      }, {
        key: 'spread',
        label: 'Run Line',
        items: [
          { market_type: 'spreads', selection_label: 'Seattle Mariners +1.5', line: 1.5, odds: -160, book_title: 'DraftKings' },
        ],
      }],
    }],
  };

  const loaded = makeContext(board);
  vm.runInNewContext(script, loaded.context);
  await tick();

  assert.deepStrictEqual(loaded.calls, [{ method: 'getMarketBoard', sportKey: 'baseball_mlb' }], 'loads existing MLB market board');
  assert(/Seattle Mariners at Texas Rangers/.test(loaded.elements.selectedMatchupTitle.textContent), 'renders selected matchup');
  assert(/Moneyline/.test(loaded.elements.marketGroups.innerHTML), 'renders moneyline context');
  assert(/Run Line/.test(loaded.elements.marketGroups.innerHTML), 'renders run line context');
  assert(!/\b\d+\s*-\s*\d+\b/.test(loaded.elements.marketGroups.innerHTML), 'market context does not render fake projected score');
  assert(!/\b\d+(\.\d+)?%/.test(loaded.elements.marketGroups.innerHTML), 'market context does not render fake win probabilities');

  const empty = makeContext({ summary: { message: 'No upcoming games found for this sport.' }, games: [] });
  vm.runInNewContext(script, empty.context);
  await tick();
  assert.strictEqual(empty.elements.mlbMatchupSelect.disabled, true, 'empty board disables selector');
  assert(/No upcoming MLB matchups/.test(empty.elements.simBoardMessage.textContent), 'empty board has defensive message');

  console.log('mlb-simulator-page-test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
