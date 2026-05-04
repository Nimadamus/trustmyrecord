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
    attributes: {},
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name];
    },
  };
}

function makeContext(boardResponse, projectionHandler) {
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
    'projectionShell',
    'projectedScoreValue',
    'winProbabilityValue',
    'confidenceEdgeValue',
    'projectionNotice',
  ].forEach((id) => { elements[id] = makeElement(id); });

  const calls = [];
  const projection = projectionHandler || (async () => ({
    projection: {
      status: 'insufficient_data',
      projection_available: false,
      projected_score: null,
      win_probability: { away: null, home: null },
      confidence_rating: null,
      edge_score: null,
      leans: { moneyline: null, run_line: null, game_total: null, team_totals: null, f5: null },
      explanation: {
        missing_data: {
          required_missing: ['starting_pitchers', 'offense', 'bullpen'],
          model_detail_missing: ['away_starter_era'],
        },
      },
    },
  }));
  const context = {
    window: {
      api: {
        ready: Promise.resolve(),
        async getMarketBoard(sportKey) {
          calls.push({ method: 'getMarketBoard', sportKey });
          return boardResponse;
        },
        async request(url) {
          calls.push({ method: 'request', url });
          return projection(url);
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
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 20; i += 1) {
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

  assert.deepStrictEqual(loaded.calls, [
    { method: 'getMarketBoard', sportKey: 'baseball_mlb' },
    { method: 'request', url: '/mlb-simulator/mlb/projection/game_1' },
  ], 'loads board and projection endpoint');
  assert(/Seattle Mariners at Texas Rangers/.test(loaded.elements.selectedMatchupTitle.textContent), 'renders selected matchup');
  assert(/Moneyline/.test(loaded.elements.marketGroups.innerHTML), 'renders moneyline context');
  assert(/Run Line/.test(loaded.elements.marketGroups.innerHTML), 'renders run line context');
  assert.strictEqual(loaded.elements.projectionShell.getAttribute('data-projection-state'), 'insufficient-data', 'renders insufficient data state');
  assert(/Backend cannot project this game yet/.test(loaded.elements.projectionNotice.textContent), 'explains insufficient backend data');
  assert(/starting pitchers|offense|bullpen/.test(loaded.elements.projectionNotice.textContent), 'lists missing simulator inputs');
  assert.strictEqual(loaded.elements.projectedScoreValue.textContent, '--', 'insufficient data keeps score blank');
  assert.strictEqual(loaded.elements.winProbabilityValue.textContent, '--', 'insufficient data keeps win probability blank');
  assert.strictEqual(loaded.elements.confidenceEdgeValue.textContent, '--', 'insufficient data keeps edge blank');
  assert(!/\b\d+\s*-\s*\d+\b/.test(loaded.elements.marketGroups.innerHTML), 'market context does not render fake projected score');
  assert(!/\b\d+(\.\d+)?%/.test(loaded.elements.marketGroups.innerHTML), 'market context does not render fake win probabilities');
  assert(!/pending picks/i.test(loaded.elements.projectionNotice.textContent + loaded.elements.marketGroups.innerHTML), 'does not expose pending picks');

  let resolveProjection;
  const loadingProjection = new Promise((resolve) => { resolveProjection = resolve; });
  const loading = makeContext(board, () => loadingProjection);
  vm.runInNewContext(script, loading.context);
  await tick();
  assert.strictEqual(loading.elements.projectionShell.getAttribute('data-projection-state'), 'loading', 'renders projection loading state');
  assert(/Loading projection/.test(loading.elements.projectionNotice.textContent), 'loading state is explicit');
  resolveProjection({
    projection: {
      status: 'insufficient_data',
      projection_available: false,
      projected_score: null,
      win_probability: { away: null, home: null },
      confidence_rating: null,
      edge_score: null,
      explanation: { missing_data: { required_missing: ['offense'] } },
    },
  });
  await tick();

  const projected = makeContext(board, async () => ({
    projection: {
      status: 'projected',
      projection_available: true,
      projected_score: { away: 4.8, home: 4.1 },
      win_probability: { away: 0.57, home: 0.43 },
      confidence_rating: { label: 'low', score: 0.41 },
      edge_score: 0.031,
      leans: { moneyline: 'Seattle Mariners' },
      explanation: { missing_data: { required_missing: [] } },
    },
  }));
  vm.runInNewContext(script, projected.context);
  await tick();
  assert.strictEqual(projected.elements.projectionShell.getAttribute('data-projection-state'), 'projected', 'renders projected state');
  assert(/Seattle Mariners 4.8 - Texas Rangers 4.1/.test(projected.elements.projectedScoreValue.textContent), 'renders real projected score');
  assert(/57%/.test(projected.elements.winProbabilityValue.textContent), 'renders real win probability');
  assert(/low/.test(projected.elements.confidenceEdgeValue.textContent), 'renders real confidence label');
  assert(/Edge \+0.031/.test(projected.elements.confidenceEdgeValue.textContent), 'renders real edge score');

  const failed = makeContext(board, async () => {
    throw new Error('Projection route failed');
  });
  vm.runInNewContext(script, failed.context);
  await tick();
  assert.strictEqual(failed.elements.projectionShell.getAttribute('data-projection-state'), 'error', 'renders projection error state');
  assert(/Projection unavailable right now/.test(failed.elements.projectionNotice.textContent), 'error state is explicit');
  assert.strictEqual(failed.elements.projectedScoreValue.textContent, '--', 'error state clears score');
  assert.strictEqual(failed.elements.winProbabilityValue.textContent, '--', 'error state clears probability');

  const malformed = makeContext(board, async () => ({
    projection: {
      status: 'placeholder_projection',
      projected_score: { away: 99, home: 99 },
      win_probability: { away: 0.99, home: 0.01 },
    },
  }));
  vm.runInNewContext(script, malformed.context);
  await tick();
  assert.strictEqual(malformed.elements.projectionShell.getAttribute('data-projection-state'), 'error', 'renders malformed payload error state');
  assert(/unsupported simulator payload/.test(malformed.elements.projectionNotice.textContent), 'malformed payload has explicit error');
  assert.strictEqual(malformed.elements.projectedScoreValue.textContent, '--', 'malformed payload does not render score');
  assert.strictEqual(malformed.elements.winProbabilityValue.textContent, '--', 'malformed payload does not render probability');
  assert(!/99/.test(malformed.elements.projectedScoreValue.textContent + malformed.elements.winProbabilityValue.textContent), 'malformed payload does not leak fallback numbers');

  const empty = makeContext({ summary: { message: 'No upcoming games found for this sport.' }, games: [] });
  vm.runInNewContext(script, empty.context);
  await tick();
  assert.strictEqual(empty.elements.mlbMatchupSelect.disabled, true, 'empty board disables selector');
  assert(/No upcoming MLB matchups/.test(empty.elements.simBoardMessage.textContent), 'empty board has defensive message');
  assert(!empty.calls.some((call) => call.method === 'request'), 'empty board does not request projection without game id');

  console.log('mlb-simulator-page-test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
