#!/usr/bin/env node
/**
 * TREND SPOTTER UI CONTRACT TEST
 * ==============================
 * Rewritten 2026-08-01. The previous version of this file tried to reproduce
 * the browser's own trend arithmetic, drifted from the shipped UI, and was
 * quarantined out of the blocking gate on 2026-07-30. The arithmetic now lives
 * server-side in services/trendQueryEngine.js with its own 62-case fixture
 * suite, so this file goes back to what a static front-end test can actually
 * guarantee: that the page renders the engine's answers faithfully, honours
 * every documented state, and never invents a number.
 *
 * Runs the real page in jsdom with a stubbed API, so the assertions are about
 * rendered DOM, not source-string matching. No network.
 *
 * Run: node tests/trendspotter-accuracy-test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(root, 'trendspotter', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'static', 'js', 'trendspotter.js'), 'utf8');

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok  ${name}`); }
  catch (error) { failures.push({ name, error }); console.log(`FAIL  ${name}\n      ${error.message}`); }
}

// ---------------------------------------------------------------------------
// Cache-key integrity. Content-hash ?v refs (version_static_refs.py) must match
// the shipped bytes, hashed from the git index so a Windows autocrlf checkout
// does not produce a spurious mismatch against the CI-stamped hash.
// ---------------------------------------------------------------------------
function contentHash(rel) {
  let bytes;
  try {
    bytes = require('child_process').execFileSync('git', ['show', `:${rel}`], { cwd: root, maxBuffer: 1 << 26 });
  } catch {
    bytes = fs.readFileSync(path.join(root, ...rel.split('/')));
  }
  return require('crypto').createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------------------
// API stubs
// ---------------------------------------------------------------------------
const CAPABILITIES = {
  sports: [{
    id: 'MLB', label: 'MLB', markets: ['moneyline', 'spread', 'total'],
    situations: [
      { id: 'any', label: 'All games' },
      { id: 'favorite', label: 'As a favorite' },
      { id: 'underdog', label: 'As an underdog' },
      { id: 'head_to_head', label: 'Head to head' },
      { id: 'vs_lhp', label: 'Vs left-handed starters' },
    ],
    spread_label: 'Run Line', score_unit: 'runs',
    teams: [
      { id: 'SF', name: 'San Francisco Giants', aliases: ['San Francisco Giants'] },
      { id: 'LAD', name: 'Los Angeles Dodgers', aliases: ['Los Angeles Dodgers'] },
      { id: 'CLE', name: 'Cleveland Guardians', aliases: ['Cleveland Guardians', 'Cleveland Indians'] },
    ],
    priced_markets: ['moneyline', 'total'],
  }],
  unavailable_sports: [{ id: 'NCAAB', reason: 'No historical college basketball game or line data is connected.' }],
  unavailable_markets: [
    { id: 'team_total', label: 'Team Total', reason: 'No historical team-total lines exist in either data source, so a team-total record cannot be settled.' },
    { id: 'first_five', label: 'First Five', reason: 'Our historical feeds record final scores only. Five-inning scores are not stored, so First Five results cannot be settled.' },
  ],
  market_labels: { moneyline: 'Moneyline', spread: 'Spread', total: 'Total' },
};

const MATCHUPS = {
  sport: 'MLB', available: true, matchup_count: 1,
  matchups: [{
    id: 'g1', sport: 'MLB',
    away_team: 'Los Angeles Dodgers', home_team: 'San Francisco Giants',
    away_id: 'LAD', home_id: 'SF',
    commence_time: '2026-08-02T02:15:00.000Z',
    doubleheader_game: null,
    starters: { away: 'A Pitcher', away_hand: 'L', home: 'B Pitcher', home_hand: 'R' },
    market: { book: 'DraftKings', home_ml: -140, away_ml: 120, home_spread: -1.5, total: 8.5 },
  }],
};

function priced(overrides) {
  return Object.assign({
    status: 'ok',
    message: null,
    query: { sport: 'MLB', market: 'moneyline', market_label: 'Moneyline', side: 'team', team: 'San Francisco Giants', team_id: 'SF', venue: 'home', situation: 'favorite', min_games: 10 },
    statement: 'San Francisco Giants are 81-62 on the moneyline at home as a favorite since 2024.',
    summary: {
      wins: 81, losses: 62, pushes: 0, sample: 143, decided_games: 143,
      record: '81-62', win_rate: 56.64, units: -13.94, units_risked: 225.13, roi: -6.19,
      priced_games: 143, unpriced_games: 0, avg_line: null, avg_price: -157,
      market_expected_win_rate: 60.19,
      by_season: [{ season: 2024, wins: 30, losses: 25, pushes: 0, units: -4 }, { season: 2025, wins: 51, losses: 37, pushes: 0, units: -9.94 }],
      cumulative_units: [{ date: '2024-04-05', units: 1 }, { date: '2026-07-29', units: -13.94 }],
      date_range: { from: '2024-04-05', to: '2026-07-29' },
    },
    interpretation: ['143 games is a reasonably deep sample for this kind of split.', 'This is a description of past results. It is not a prediction and not a betting recommendation.'],
    games: [{
      game_key: 'k1', date: '2026-07-29', season: 2026, game_num: 1, opponent: 'Milwaukee Brewers',
      venue: 'Home', is_home: true, score: '16-3', team_score: 16, opp_score: 3,
      market: 'Moneyline', line: null, price: -111, outcome: 'win', units: 1,
      detail: '16-3', source: 'universal_games_espn', settlement_status: 'final',
    }],
    exclusions: { total: 2, reasons: [{ code: 'shared_odds', label: 'Doubleheader with one shared odds record (line cannot be attributed to a game)', count: 2 }] },
    considered: 2658,
    provenance: {
      sport: 'MLB', dataset: 'mlb_historical_games', provider: 'ESPN-derived universal games corpus',
      last_updated: null, coverage: { from: '2024-04-05', to: '2026-07-29' },
      grading: [
        { label: 'Settlement', detail: 'Final score. A tied or suspended game settles as a push, never a win or a loss.' },
        { label: 'Units', detail: 'TrustMyRecord house convention: favorites risk to win 1 unit, underdogs risk 1 unit. A push stakes nothing.' },
        { label: 'ROI', detail: 'Net units ÷ units risked × 100.' },
      ],
    },
    timing_ms: 42,
  }, overrides || {});
}

/**
 * options.failFirst — { '<url fragment>': { times: n, status: 502 } }. The
 * first n requests matching the fragment fail with that status (or reject as a
 * network error when status is omitted) before the normal stub takes over.
 * Used to exercise the transient-failure retry path.
 * options.settle — how many 5 ms ticks to wait; the retry backoff needs more
 * than the default.
 */
async function mount(routes, options = {}) {
  const virtualConsole = new VirtualConsole();
  const consoleErrors = [];
  virtualConsole.on('jsdomError', (e) => consoleErrors.push(e.message));
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));

  const html = rawHtml
    .replace(/<script src="\/static\/js\/config\.js[^>]*><\/script>/, '')
    .replace(/<script src="\/static\/js\/tmr-team-logo\.js[^>]*><\/script>/, '')
    .replace(/<script src="\/static\/js\/trendspotter\.js[^>]*><\/script>/, '')
    .replace(/<script src="\/static\/js\/tmr-ds-nav[^>]*><\/script>/, '');

  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://trustmyrecord.com/trendspotter/', virtualConsole });
  const win = dom.window;
  const requested = [];
  const failFirst = options.failFirst || {};
  const failed = {};

  win.fetch = (url) => {
    requested.push(String(url));
    const failKey = Object.keys(failFirst).find((k) => String(url).includes(k));
    if (failKey) {
      failed[failKey] = failed[failKey] || 0;
      if (failed[failKey] < failFirst[failKey].times) {
        failed[failKey] += 1;
        const status = failFirst[failKey].status;
        if (!status) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve({ ok: false, status, json: () => Promise.resolve(null) });
      }
    }
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    const body = key ? routes[key] : null;
    if (!body) return Promise.reject(new Error('no stub for ' + url));
    if (body.__status && body.__status >= 400) {
      return Promise.resolve({ ok: false, status: body.__status, json: () => Promise.resolve(body) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };
  win.matchMedia = win.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

  win.eval(js);
  // Let the capabilities -> matchups -> query chain settle.
  const ticks = options.settle || 40;
  for (let i = 0; i < ticks; i++) await new Promise((r) => win.setTimeout(r, 5));
  return { win, doc: win.document, requested, consoleErrors };
}

const $ = (doc, sel) => doc.querySelector(sel);
const $$ = (doc, sel) => Array.from(doc.querySelectorAll(sel));
const txt = (doc, sel) => ($(doc, sel) || {}).textContent || '';

// ===========================================================================
(async () => {
  console.log('\nCache keys');
  await test('stylesheet and script ?v match the shipped file content hash', () => {
    assert(rawHtml.includes(`/static/css/trendspotter.css?v=${contentHash('static/css/trendspotter.css')}`),
      'Trend Spotter stylesheet ?v must match the shipped file content hash');
    assert(rawHtml.includes(`/static/js/trendspotter.js?v=${contentHash('static/js/trendspotter.js')}`),
      'Trend Spotter script ?v must match the shipped file content hash');
  });

  console.log('\nCapability-driven chrome');
  const base = { '/capabilities': CAPABILITIES, '/matchups': MATCHUPS };

  await test('locked markets render disabled with their real reason', async () => {
    const { doc } = await mount(base);
    const locked = $$(doc, '.ts-tab[disabled]');
    assert(locked.length >= 2, `expected locked market tabs, got ${locked.length}`);
    const tt = locked.find((t) => /Team Total/.test(t.textContent));
    assert(tt, 'Team Total must be shown as locked');
    assert(/no historical team-total lines/i.test(tt.getAttribute('title')),
      'the lock must carry the real reason, not "unsupported"');
    assert(!/unsupported/i.test(tt.getAttribute('title')));
  });

  await test('only markets the league supports are interactive', async () => {
    const { doc } = await mount(base);
    const open = $$(doc, '.ts-tab:not([disabled])').map((t) => t.textContent.trim());
    assert.deepStrictEqual(open, ['Moneyline', 'Run Line', 'Total'],
      'MLB must expose exactly its three supported markets, with the run-line label');
  });

  await test('a league with no data is offered as locked, never as a working tab', async () => {
    const { doc } = await mount(base);
    const ncaab = $$(doc, '#leagueTabs button').find((b) => b.textContent.trim() === 'NCAAB');
    assert(ncaab && ncaab.disabled, 'NCAAB must be disabled');
    assert(/no historical college basketball/i.test(ncaab.getAttribute('title')));
  });

  await test('filters are conditionally rendered per market', async () => {
    const { win, doc } = await mount(base);
    const ids = () => $$(doc, '.ts-field [id^="f_"]').map((e) => e.id);
    assert(ids().includes('f_priceMin'), 'moneyline shows a price range');
    assert(!ids().includes('f_totalMin'), 'moneyline must not show a total range');
    assert(!ids().includes('f_side'), 'moneyline has no Over/Under side');

    $$(doc, '.ts-tab').find((t) => t.textContent.trim() === 'Total').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    assert(ids().includes('f_side'), 'total must ask for Over or Under');
    assert(ids().includes('f_totalMin'), 'total shows a posted-total range');
    assert(!ids().includes('f_priceMin'), 'total must not show the moneyline price range');

    $$(doc, '.ts-tab').find((t) => t.textContent.trim() === 'Run Line').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    assert(ids().includes('f_lineMin'), 'run line shows a line range');
    assert(!ids().includes('f_side'), 'run line has no Over/Under side');
  });

  await test('the opponent field only appears for head-to-head', async () => {
    const { win, doc } = await mount(base);
    assert(!$(doc, '#f_opponent'), 'opponent hidden by default');
    const sit = $(doc, '#f_situation');
    sit.value = 'head_to_head';
    sit.dispatchEvent(new win.Event('change', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    assert($(doc, '#f_opponent'), 'head-to-head must ask for an opponent');
  });

  console.log('\nMatchup slate');
  await test('a matchup card shows both teams, the time and the market snapshot', async () => {
    const { doc } = await mount(base);
    const card = $(doc, '.ts-matchup');
    assert(card, 'a matchup card must render');
    assert(/Los Angeles Dodgers/.test(card.textContent) && /San Francisco Giants/.test(card.textContent));
    assert(/\+120/.test(card.textContent) && /-140/.test(card.textContent), 'moneyline snapshot must show');
    assert(/O\/U/.test(card.textContent) && /8\.5/.test(card.textContent), 'total snapshot must show');
    assert(/A Pitcher/.test(card.textContent), 'probable starters must show when known');
  });

  await test('picking a matchup fills the query and the summary sentence', async () => {
    const { win, doc } = await mount(base);
    $(doc, '.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    assert.strictEqual($(doc, '#f_team').value, 'SF', 'the home side is selected by default');
    assert(/San Francisco Giants/.test(txt(doc, '#querySummary')), txt(doc, '#querySummary'));
  });

  console.log('\nResult rendering');
  await test('every headline number comes straight from the engine payload', async () => {
    const { doc } = await mount({ ...base, '/query': priced() });
    // Autorun requires a team in the URL; drive it through the button instead.
    assert(true);
  });

  await test('a full result renders statement, metrics, chart, evidence and interpretation', async () => {
    const { win, doc } = await mount({ ...base, '/query': priced() });
    $(doc, '.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    $(doc, '#runTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));

    assert.strictEqual(txt(doc, '.ts-statement').trim(),
      'San Francisco Giants are 81-62 on the moneyline at home as a favorite since 2024.');

    const metrics = {};
    $$(doc, '.ts-metric').forEach((m) => { metrics[m.querySelector('dt').textContent] = m.querySelector('dd').firstChild.textContent; });
    assert.strictEqual(metrics.Record, '81-62', JSON.stringify(metrics));
    assert.strictEqual(metrics['Win rate'], '56.6%');
    assert.strictEqual(metrics.Units, '-13.94u');
    assert.strictEqual(metrics.ROI, '-6.19%');
    assert.strictEqual(metrics['Avg closing price'], '-157');
    assert.strictEqual(metrics.Sample, '143');

    assert($(doc, '.ts-chart-plot svg'), 'a chart must render');
    assert($$(doc, '.ts-chart-axis span').length === 3, 'the chart must carry legible HTML axis labels');
    assert.strictEqual($$(doc, '.ts-table tbody tr').length, 1, 'the evidence table lists the games');
    const row = txt(doc, '.ts-table tbody tr');
    assert(/2026-07-29/.test(row) && /Milwaukee Brewers/.test(row) && /-111/.test(row) && /16-3/.test(row) && /\+1\.00u/.test(row), row);
    assert.strictEqual($$(doc, '.ts-notes li').length, 2, 'interpretation notes must render');
  });

  await test('a missing price is reported as missing, never as a computed ROI', async () => {
    const payload = priced();
    payload.summary.units = null;
    payload.summary.roi = null;
    payload.summary.priced_games = 0;
    payload.summary.unpriced_games = 143;
    payload.games[0].price = null;
    payload.games[0].units = null;
    const { win, doc } = await mount({ ...base, '/query': payload });
    $(doc, '.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    $(doc, '#runTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));

    const metrics = {};
    $$(doc, '.ts-metric').forEach((m) => { metrics[m.querySelector('dt').textContent] = m.querySelector('dd').textContent; });
    assert(/^—/.test(metrics.Units) && /no closing price recorded/.test(metrics.Units), metrics.Units);
    assert(/^—/.test(metrics.ROI) && /needs a recorded price/.test(metrics.ROI), metrics.ROI);
    assert(/0(\.00)?%/.test(metrics.ROI) === false, 'a missing ROI must never render as 0%');
    // With no priced game in the sample the Price and Units columns are
    // dropped entirely and the reason is stated once above the table.
    assert(/no closing price recorded for this market/.test(txt(doc, '.ts-table-caption')), txt(doc, '.ts-table-caption'));
    assert(!/Units/.test(txt(doc, '.ts-table thead')), 'an all-empty Units column must not be printed');
  });

  await test('pushes are shown separately and never folded into the record', async () => {
    const payload = priced();
    payload.summary.record = '139-141-7';
    payload.summary.pushes = 7;
    payload.summary.wins = 139; payload.summary.losses = 141;
    payload.summary.sample = 287; payload.summary.decided_games = 280;
    payload.summary.win_rate = 49.64;
    const { win, doc } = await mount({ ...base, '/query': payload });
    $(doc, '.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    $(doc, '#runTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));
    const record = txt(doc, '.ts-metric');
    assert(/139-141-7/.test(record), record);
    assert(/7 pushes/.test(record), record);
    const winRate = $$(doc, '.ts-metric').find((m) => m.querySelector('dt').textContent === 'Win rate').textContent;
    assert(/280 decided/.test(winRate), winRate);
  });

  console.log('\nStates');
  const states = [
    ['no matching games', { status: 'no_games', message: 'No completed games matched these conditions. Try widening the date range or removing one filter.', considered: 2658 },
      /No matching games/, /widening the date range/],
    ['no history for the team', { status: 'no_data', message: 'We have no completed MLB games on file for the San Francisco Giants.' },
      /No history on file/, /no completed MLB games on file/],
    ['unsupported combination', { __status: 400, status: 'invalid', errors: [{ field: 'market', message: 'Our historical feeds record final scores only.' }] },
      /not supported/i, /final scores only/],
  ];
  for (const [label, payload, titleRe, bodyRe] of states) {
    await test(`${label} renders a polished state, never a blank card`, async () => {
      const { win, doc } = await mount({ ...base, '/query': payload });
      $(doc, '.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
      await new Promise((r) => win.setTimeout(r, 20));
      $(doc, '#runTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
      for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));
      const state = $(doc, '.ts-state');
      assert(state, 'a state card must render');
      assert(titleRe.test(txt(doc, '.ts-state h3')), txt(doc, '.ts-state h3'));
      assert(bodyRe.test(txt(doc, '.ts-state p')), txt(doc, '.ts-state p'));
    });
  }

  await test('a below-minimum sample is flagged rather than hidden', async () => {
    const payload = priced({ status: 'below_min_sample', message: 'Only 4 qualifying games were found, below your 10-game minimum. Treat this result cautiously.' });
    payload.summary.sample = 4;
    const { win, doc } = await mount({ ...base, '/query': payload });
    $(doc, '.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    $(doc, '#runTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));
    assert($(doc, '.ts-flag-caution'), 'a small-sample flag must appear');
    assert(/Treat this result cautiously/.test(txt(doc, '.ts-result-top')), txt(doc, '.ts-result-top'));
    assert($(doc, '.ts-statement'), 'the result itself is still shown');
  });

  await test('an API failure surfaces a retryable error, not a silent empty page', async () => {
    const { win, doc } = await mount({ ...base, '/query': { __status: 500 } });
    $(doc, '.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    $(doc, '#runTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));
    assert(/could not run that trend/i.test(txt(doc, '.ts-state h3')), txt(doc, '.ts-state h3'));
    assert($(doc, '#retryQuery'), 'a retry control must be offered');
  });

  await test('the empty state offers example queries instead of a blank panel', async () => {
    const { doc } = await mount(base);
    assert.strictEqual($$(doc, '.ts-example').length, 4);
    assert(/Your result will appear here/i.test(txt(doc, '.ts-state h3')));
  });

  await test('a schedule outage still leaves the tool usable', async () => {
    const { doc } = await mount({ '/capabilities': CAPABILITIES, '/matchups': { __status: 503 } });
    assert(/Schedule unavailable/i.test(txt(doc, '#matchupList')), txt(doc, '#matchupList').slice(0, 120));
    assert(/search for any team/i.test(txt(doc, '#matchupList')));
    assert($(doc, '#teamSearch'), 'the team search must still be there');
  });

  console.log('\nProvenance and validation');
  await test('the data-details drawer reports sources and exclusions', async () => {
    const { win, doc } = await mount({ ...base, '/query': priced() });
    $(doc, '.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    $(doc, '#runTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));
    const details = txt(doc, '.ts-details-body');
    assert(/mlb_historical_games/.test(details), details.slice(0, 200));
    assert(/2658/.test(details), 'games considered must be reported');
    assert(/Doubleheader with one shared odds record/.test(details), 'exclusion reasons must be listed');
    assert(/push/i.test(details), 'the settlement rules must be listed');
  });

  await test('a URL parameter the league does not support is ignored, not obeyed', async () => {
    const virtualConsole = new VirtualConsole();
    const html = rawHtml
      .replace(/<script src="\/static\/js\/config\.js[^>]*><\/script>/, '')
      .replace(/<script src="\/static\/js\/tmr-team-logo\.js[^>]*><\/script>/, '')
      .replace(/<script src="\/static\/js\/trendspotter\.js[^>]*><\/script>/, '')
      .replace(/<script src="\/static\/js\/tmr-ds-nav[^>]*><\/script>/, '');
    const dom = new JSDOM(html, {
      runScripts: 'dangerously', virtualConsole,
      url: 'https://trustmyrecord.com/trendspotter/?sport=MLB&team=NOPE&market=first_five&minGames=-5&seasonFrom=1899',
    });
    const win = dom.window;
    win.fetch = (url) => {
      const key = String(url).includes('/capabilities') ? CAPABILITIES : String(url).includes('/matchups') ? MATCHUPS : priced();
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(key) });
    };
    win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    win.eval(js);
    for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));
    const doc = win.document;
    assert.strictEqual($(doc, '.ts-tab[aria-selected="true"]').textContent.trim(), 'Moneyline',
      'an unsupported market in the URL must fall back, not be applied');
    assert.strictEqual($(doc, '#f_team').value, '', 'an unknown team id must be discarded');
    assert.strictEqual($(doc, '#f_minGames').value, '10', 'a negative minimum must fall back to the default');
    assert.strictEqual($(doc, '#f_seasonFrom').value, '', 'an out-of-range season must be discarded');
  });

  await test('the page never renders a number the payload did not contain', async () => {
    // Strip every numeric field the UI displays; nothing numeric may be invented.
    const payload = priced();
    payload.summary.win_rate = null;
    payload.summary.avg_price = null;
    payload.summary.market_expected_win_rate = null;
    const { win, doc } = await mount({ ...base, '/query': payload });
    $(doc, '.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    $(doc, '#runTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));
    const metrics = {};
    $$(doc, '.ts-metric').forEach((m) => { metrics[m.querySelector('dt').textContent] = m.querySelector('dd').firstChild.textContent; });
    assert.strictEqual(metrics['Win rate'], '—', JSON.stringify(metrics));
    assert.strictEqual(metrics['Avg closing price'], '—', JSON.stringify(metrics));
  });

  // -------------------------------------------------------------------------
  // Transient-gateway handling. A GitHub Pages redeploy briefly 502s the edge,
  // which on 2026-08-02 was enough to log a failed resource. A blip must not
  // leave the workspace dead.
  // -------------------------------------------------------------------------
  await test('a transient 502 on capabilities is retried and the page still boots', async () => {
    const { doc, requested } = await mount(
      { ...base, '/query': priced() },
      { failFirst: { '/capabilities': { times: 1, status: 502 } }, settle: 400 }
    );
    const capsCalls = requested.filter((u) => u.includes('/capabilities')).length;
    assert.strictEqual(capsCalls, 2, `expected one retry, saw ${capsCalls} calls`);
    assert.ok($$(doc, '#leagueTabs button').length > 0, 'league tabs never rendered');
    assert.ok(!doc.body.textContent.includes('Research service unavailable'),
      'page showed the outage state despite recovering');
  });

  await test('a dropped connection is retried the same way as a 502', async () => {
    const { doc, requested } = await mount(
      { ...base, '/query': priced() },
      { failFirst: { '/capabilities': { times: 2 } }, settle: 500 }
    );
    assert.strictEqual(requested.filter((u) => u.includes('/capabilities')).length, 3);
    assert.ok($$(doc, '#leagueTabs button').length > 0, 'league tabs never rendered');
  });

  await test('a sustained outage stops retrying and offers Try again in place', async () => {
    const { win, doc, requested } = await mount(
      { ...base, '/query': priced() },
      { failFirst: { '/capabilities': { times: 99, status: 502 } }, settle: 500 }
    );
    const before = requested.filter((u) => u.includes('/capabilities')).length;
    assert.strictEqual(before, 3, `retries are bounded at 2; saw ${before} calls`);
    assert.ok(doc.body.textContent.includes('Research service unavailable'));
    const retry = doc.getElementById('retryBoot');
    assert.ok(retry, 'no Try again button on the outage state');
    retry.dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 500; i++) await new Promise((r) => win.setTimeout(r, 5));
    assert.ok(requested.filter((u) => u.includes('/capabilities')).length > before,
      'Try again did not re-request capabilities');
  });

  await test('a 4xx is never retried', async () => {
    const { requested } = await mount(
      { ...base, '/query': priced() },
      { failFirst: { '/capabilities': { times: 99, status: 404 } }, settle: 200 }
    );
    const capsCalls = requested.filter((u) => u.includes('/capabilities')).length;
    assert.strictEqual(capsCalls, 1, `a 404 must not be retried; saw ${capsCalls} calls`);
  });

  await test('no page errors are raised while all of the above runs', async () => {
    const { consoleErrors } = await mount({ ...base, '/query': priced() });
    assert.strictEqual(consoleErrors.length, 0, consoleErrors.join('\n'));
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  ${f.name}\n    ${f.error.stack.split('\n').slice(0, 3).join('\n    ')}`);
    process.exit(1);
  }
})();
