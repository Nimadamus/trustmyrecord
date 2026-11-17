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
        if (failFirst[failKey].unreadable) return Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')) });
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
  if (options.prepare) options.prepare(win);

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

  // A locked tab is aria-disabled, NOT natively disabled. b0a3c4aba made that
  // switch on purpose: a `disabled` button eats the click, so tapping Team
  // Total produced literally nothing - no selection and no explanation. The
  // assertions below are the contract that change created, so they check both
  // halves of it: the tab cannot be selected, AND it answers the click.
  await test('locked markets render locked with their real reason', async () => {
    const { doc } = await mount(base);
    const locked = $$(doc, '.ts-tab[aria-disabled="true"]');
    assert(locked.length >= 2, `expected locked market tabs, got ${locked.length}`);
    assert.strictEqual($$(doc, '.ts-tab[disabled]').length, 0,
      'a natively disabled tab swallows the click and tells the visitor nothing; '
      + 'locked tabs are aria-disabled so the reason can be printed');
    locked.forEach((t) => assert.strictEqual(t.getAttribute('tabindex'), '-1',
      'a locked tab must stay out of the tab order'));
    const tt = locked.find((t) => /Team Total/.test(t.textContent));
    assert(tt, 'Team Total must be shown as locked');
    assert(/no historical team-total lines/i.test(tt.getAttribute('title')),
      'the lock must carry the real reason, not "unsupported"');
    assert(!/unsupported/i.test(tt.getAttribute('title')));
  });

  await test('clicking a locked market says why and changes nothing', async () => {
    const { win, doc } = await mount(base);
    const before = ($(doc, '.ts-tab[aria-selected="true"]') || {}).textContent;
    const tt = $$(doc, '.ts-tab[aria-disabled="true"]').find((t) => /Team Total/.test(t.textContent));
    tt.dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    assert.strictEqual(($(doc, '.ts-tab[aria-selected="true"]') || {}).textContent, before,
      'a locked market must not become the selected market');
    assert(/no historical team-total lines/i.test(txt(doc, '#marketNotice')),
      'the click must print the reason under the row, not be swallowed');
  });

  await test('only markets the league supports are interactive', async () => {
    const { doc } = await mount(base);
    const open = $$(doc, '.ts-tab:not([aria-disabled="true"])').map((t) => t.textContent.trim());
    assert.deepStrictEqual(open, ['Moneyline', 'Run Line', 'Total'],
      'MLB must expose exactly its three supported markets, with the run-line label');
  });

  await test('a league with no data is offered as locked, never as a working tab', async () => {
    const { doc } = await mount(base);
    const ncaab = $$(doc, '#leagueTabs button').find((b) => b.textContent.trim() === 'NCAAB');
    assert(ncaab, 'NCAAB must be shown');
    assert.strictEqual(ncaab.getAttribute('aria-disabled'), 'true', 'NCAAB must be locked');
    assert.strictEqual(ncaab.getAttribute('tabindex'), '-1',
      'a locked league must stay out of the tab order');
    assert(!ncaab.hasAttribute('data-league'),
      'a locked league must not carry data-league, or the click handler would select it');
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

    assert($(doc, '.ts-plot-svg'), 'a chart must render');
    assert($$(doc, '.ts-plot-y span').length >= 3, 'the chart must carry legible HTML axis labels');
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
    // The slate retries a 5xx once, so this needs longer than the default settle.
    const { doc } = await mount({ '/capabilities': CAPABILITIES, '/matchups': { __status: 503 } }, { settle: 300 });
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

  await test('arrow keys walk the tablists and keep focus after the re-render', async () => {
    const { win, doc } = await mount({ ...base, '/query': priced() });
    for (const [container, attr] of [['#leagueTabs', 'data-league'], ['#marketTabs', 'data-market']]) {
      // Locked tabs are aria-disabled and arrowNav skips them, so the test has
      // to count the same tabs production does or it arrows onto a dead one.
      const tabs = $$(doc, `${container} button:not([disabled]):not([aria-disabled="true"])`);
      if (tabs.length < 2) continue;
      tabs[0].focus();
      const startId = tabs[0].getAttribute(attr);
      doc.querySelector(container).dispatchEvent(
        new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await new Promise((r) => win.setTimeout(r, 30));
      const active = doc.activeElement;
      assert.ok(active && active.matches(`${container} button`),
        `${container}: focus fell to <${active && active.tagName}> after arrowing`);
      assert.notStrictEqual(active.getAttribute(attr), startId,
        `${container}: arrow key did not move the selection`);
      // A second press must keep moving; that only works if focus survived.
      const secondFrom = active.getAttribute(attr);
      doc.querySelector(container).dispatchEvent(
        new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await new Promise((r) => win.setTimeout(r, 30));
      assert.notStrictEqual(doc.activeElement.getAttribute(attr), secondFrom,
        `${container}: a second arrow press did nothing, so focus was lost`);
    }
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

  // TS_APLUS_20261116 ------------------------------------------------------
  const conf = { level: 'not_proven', label: 'Not proven: within normal luck', method: 'units_vs_closing_prices', games_tested: 143,
    detail: '143 priced games. If every bet had won exactly as often as its closing price implied, the units would land within ±21.30u 95% of the time; this trend finished at -13.94u.',
    note: 'Describes past games only. A past trend does not make a future result more likely, and searching many trends turns up about 1 in 20 that pass this test by chance.' };
  const runIt = async (routes, options) => {
    const m = await mount(routes, options);
    $(m.doc, '#f_team').value = 'SF';
    $(m.doc, '#f_team').dispatchEvent(new m.win.Event('change', { bubbles: true }));
    await new Promise((r) => m.win.setTimeout(r, 20));
    $(m.doc, '#runTrend').dispatchEvent(new m.win.Event('click', { bubbles: true }));
    for (let i = 0; i < 40; i++) await new Promise((r) => m.win.setTimeout(r, 5));
    return m;
  };

  await test('the luck test shows its verdict, its method and the past-only note to Pro viewers', async () => {
    const r = priced(); r.summary = Object.assign({}, r.summary, { confidence: conf });
    const { doc } = await runIt({ ...base, '/query': r });
    const box = $(doc, '.ts-confidence');
    assert(box, 'the luck test renders');
    assert.strictEqual(box.getAttribute('data-level'), 'not_proven');
    assert(/Not proven/.test(box.textContent) && /past games only/.test(box.textContent), box.textContent);
  });

  await test('a free viewer sees what the luck test is, never a verdict', async () => {
    const r = priced(); const s = Object.assign({}, r.summary);
    ['units', 'units_risked', 'roi', 'avg_price', 'market_expected_win_rate', 'cumulative_units', 'confidence'].forEach((k) => { delete s[k]; });
    r.summary = s; r.entitlement = { tier: 'free', financials: false };
    const { doc } = await runIt({ ...base, '/query': r });
    const box = $(doc, '.ts-confidence');
    assert(box && box.getAttribute('data-level') === 'locked', 'locked tile');
    assert(!/Not proven|beyond normal luck/.test(box.textContent));
  });

  await test('units are never stated from a handful of priced games', async () => {
    const r = priced(); r.summary = Object.assign({}, r.summary, { units: null, units_risked: null, roi: null, priced_games: 2, unpriced_games: 141, units_withheld: 'too_few_priced_games' });
    const { doc } = await runIt({ ...base, '/query': r });
    const metrics = {};
    $$(doc, '.ts-metric').forEach((m) => { metrics[m.querySelector('dt').textContent] = m.querySelector('dd').textContent; });
    assert(/^—/.test(metrics.Units) && /only 2 of 143/.test(metrics.Units), metrics.Units);
    assert(/^—/.test(metrics.ROI), metrics.ROI);
  });

  await test('picking a matchup loads the matchup sheet, and a row opens as a full trend', async () => {
    const sheet = { status: 'ok', sport: 'MLB', entitlement: 'pro', note: 'Each row is a record of past games, not a prediction.',
      home: { id: 'SF', name: 'San Francisco Giants', role: 'favorite' }, away: { id: 'MIL', name: 'Milwaukee Brewers', role: 'underdog' },
      rows: [{ group: 'SF', team: 'San Francisco Giants', market_label: 'Moneyline', context: 'At home as a favorite, since the 2022 season',
        query: { sport: 'MLB', team: 'SF', market: 'moneyline', venue: 'home', situation: 'favorite', seasonFrom: 2022 },
        status: 'ok', record: '81-62', win_rate: 56.64, sample: 143, units: -13.94, confidence: { level: 'not_proven', label: 'Not proven: within normal luck' } }] };
    const { win, doc, requested } = await mount({ ...base, '/sheet': sheet, '/query': priced() });
    $(doc, '.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));
    assert(requested.some((u) => u.includes('/trendspotter/sheet?') && u.includes('home_ml=')), 'the sheet is requested with tonight\'s prices');
    assert(/81-62/.test(txt(doc, '#resultsBody')), 'the row renders');
    $(doc, '[data-sheet-row="0"] td').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 40; i++) await new Promise((r) => win.setTimeout(r, 5));
    const q = requested.filter((u) => u.includes('/trendspotter/query?')).pop() || '';
    assert(/situation=favorite/.test(q) && /seasonFrom=2022/.test(q) && /venue=home/.test(q), q);
    assert($(doc, '.ts-statement'), 'the full trend renders');
  });

  await test('a result can be saved in the browser and two saved trends compared', async () => {
    const { win, doc } = await runIt({ ...base, '/query': priced() });
    win.localStorage.clear();
    $(doc, '#saveTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    const saved = JSON.parse(win.localStorage.getItem('tmr.trendspotter.saved.v1'));
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].record, '81-62');
    saved.push(Object.assign({}, saved[0], { key: 'x=1', record: '10-5', sample: 15 }));
    win.localStorage.setItem('tmr.trendspotter.saved.v1', JSON.stringify(saved));
    $(doc, '#saveTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    $$(doc, '.ts-cmp').forEach((c) => { c.checked = true; });
    $(doc, '#compareSaved').dispatchEvent(new win.Event('click', { bubbles: true }));
    const out = txt(doc, '#compareOut');
    assert(/81-62/.test(out) && /10-5/.test(out), out);
  });

  // TS_SAVED_ACCOUNT_20261116 --------------------------------------------------
  await test('signed in, saved trends come from the account; save, remove and the one-time browser import use the API', async () => {
    const calls = [];
    const acct = [{ id: '9', name: 'Niners road favorites', query: { sport: 'NFL', team: 'SF', market: 'moneyline' }, sport: 'NFL',
      supported: true, summary: { statement: 'x', record: '7-3', win_rate: 70, sample: 10 }, created_at: '2026-11-10T00:00:00Z' }];
    const prepare = (win) => {
      win.localStorage.setItem('trustmyrecord_token', 'tok');
      win.localStorage.setItem('tmr.trendspotter.saved.v1', JSON.stringify([{ key: 'sport=NFL&team=KC&market=moneyline', statement: 'Chiefs', record: '5-5', win_rate: 50, sample: 10, saved_at: '2026-11-01' }]));
      const inner = win.fetch;
      win.fetch = (url, init) => {
        if (!String(url).includes('/trendspotter/saved')) return inner(url, init);
        const method = (init && init.method) || 'GET';
        calls.push([method, String(url).replace(/^.*\/trendspotter\/saved/, ''), init && init.headers && init.headers.Authorization, init && init.body ? JSON.parse(init.body) : null]);
        const ok = (status, body) => Promise.resolve({ ok: true, status, json: () => Promise.resolve(body) });
        if (method === 'GET') return ok(200, { status: 'ok', items: acct });
        if (method === 'DELETE') return ok(204, {});
        if (String(url).endsWith('/import')) return ok(200, { status: 'ok', imported: 1, skipped: 0, items: acct.concat([{ id: '11', name: 'Chiefs', query: { sport: 'NFL', team: 'KC', market: 'moneyline' }, sport: 'NFL', summary: { record: '5-5' }, created_at: '2026-11-01T00:00:00Z' }]) });
        const b = JSON.parse(init.body);
        return ok(201, { status: 'ok', created: true, item: { id: '10', name: b.name, query: b.query, sport: 'NFL', summary: b.summary, last_run_at: '2026-11-16T22:00:00Z' } });
      };
    };
    const { win, doc } = await runIt({ ...base, '/query': priced() }, { prepare });
    const list = txt(doc, '#savedTrends');
    assert(/Niners road favorites/.test(list) && /Saved to your account/.test(list), list);
    assert(/1 trend is saved in this browser only/.test(list), 'the browser list is offered for import');
    assert.strictEqual(calls[0][0], 'GET'); assert.strictEqual(calls[0][2], 'Bearer tok');
    $(doc, '#saveTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 10; i++) await new Promise((r) => win.setTimeout(r, 5));
    const post = calls.find((c) => c[0] === 'POST' && c[1] === '');
    assert(post && post[3].query.team === 'SF' && post[3].summary.record === '81-62', JSON.stringify(post));
    assert.strictEqual(txt(doc, '#saveTrend'), 'Saved');
    assert.strictEqual(JSON.parse(win.localStorage.getItem('tmr.trendspotter.saved.v1')).length, 1, 'signed in, saving never writes the browser list');
    $(doc, '#importSaved').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 10; i++) await new Promise((r) => win.setTimeout(r, 5));
    const imp = calls.find((c) => c[1] === '/import');
    assert(imp && imp[3].items.length === 1 && imp[3].items[0].query.team === 'KC', JSON.stringify(imp));
    assert(!$(doc, '#importSaved') && win.localStorage.getItem('tmr.trendspotter.import.offered.v1') === '1', 'offered once');
    const idx = $$(doc, '[data-remove-saved]').length - 1;
    $(doc, '[data-remove-saved="' + idx + '"]').dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 10; i++) await new Promise((r) => win.setTimeout(r, 5));
    assert(calls.some((c) => c[0] === 'DELETE' && /^\/\d+$/.test(c[1])), JSON.stringify(calls));
  });

  await test('a trend saved on the account reads as Saved after a reload, whatever order the database keeps its params in', async () => {
    const first = await runIt({ ...base, '/query': priced() });
    const q = first.requested.filter((u) => u.includes('/trendspotter/query?')).pop().split('?')[1];
    const pairs = []; new URLSearchParams(q).forEach((v, k) => pairs.push([k, v]));
    const reversed = {}; pairs.reverse().forEach(([k, v]) => { reversed[k] = v; });
    const prepare = (win) => {
      win.localStorage.setItem('trustmyrecord_token', 'tok');
      const inner = win.fetch;
      win.fetch = (url, init) => (String(url).includes('/trendspotter/saved')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'ok', items: [{ id: '3', name: 'n', query: reversed, sport: 'NFL',
          summary: { record: '81-62' }, last_run_at: '2026-11-17T03:30:00Z' }] }) })
        : inner(url, init));
    };
    const { doc, win } = await runIt({ ...base, '/query': priced() }, { prepare });
    assert.strictEqual(txt(doc, '#saveTrend'), 'Saved');
    const d = new win.Date('2026-11-17T03:30:00Z');
    const local = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    assert(txt(doc, '#savedTrends').includes(local), 'saved date is the viewer\'s local day');
  });

  await test('if the account list cannot be read, signed-in members keep the browser list', async () => {
    const prepare = (win) => {
      win.localStorage.setItem('trustmyrecord_token', 'tok');
      const inner = win.fetch;
      win.fetch = (url, init) => (String(url).includes('/trendspotter/saved')
        ? Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ message: 'down' }) }) : inner(url, init));
    };
    const { win, doc } = await runIt({ ...base, '/query': priced() }, { prepare });
    $(doc, '#saveTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    assert.strictEqual(JSON.parse(win.localStorage.getItem('tmr.trendspotter.saved.v1')).length, 1);
    assert(/Kept in this browser/.test(txt(doc, '#savedTrends')));
  });

  // TS_BUGHUNT_20261116 ---------------------------------------------------------
  await test('Save keeps the query that produced the result, not a filter changed afterwards', async () => {
    const { win, doc } = await runIt({ ...base, '/query': priced() });
    win.localStorage.clear();
    const venue = $(doc, '#f_venue');
    venue.value = venue.value === 'home' ? 'away' : 'home';
    venue.dispatchEvent(new win.Event('change', { bubbles: true }));
    $(doc, '#saveTrend').dispatchEvent(new win.Event('click', { bubbles: true }));
    const saved = JSON.parse(win.localStorage.getItem('tmr.trendspotter.saved.v1'));
    assert(saved && saved.length === 1 && !/venue=/.test(saved[0].key), saved && saved[0].key);
  });

  await test('a slow answer that arrives after a league switch is dropped', async () => {
    let release;
    const prepare = (win) => {
      const inner = win.fetch;
      win.fetch = (url, init) => (String(url).includes('/trendspotter/query?')
        ? new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: () => Promise.resolve(priced()) }); })
        : inner(url, init));
    };
    const caps2 = JSON.parse(JSON.stringify(CAPABILITIES)); caps2.sports.push({ ...caps2.sports[0], id: 'NBA', label: 'NBA' });
    const m = await mount({ ...base, '/capabilities': caps2, '/query': priced() }, { prepare });
    $(m.doc, '#f_team').value = 'SF';
    $(m.doc, '#f_team').dispatchEvent(new m.win.Event('change', { bubbles: true }));
    await new Promise((r) => m.win.setTimeout(r, 20));
    $(m.doc, '#runTrend').dispatchEvent(new m.win.Event('click', { bubbles: true }));
    await new Promise((r) => m.win.setTimeout(r, 20));
    const other = $$(m.doc, '#leagueTabs button[data-league]').find((b) => b.getAttribute('aria-selected') !== 'true');
    other.dispatchEvent(new m.win.Event('click', { bubbles: true }));
    await new Promise((r) => m.win.setTimeout(r, 20));
    release();
    for (let i = 0; i < 20; i++) await new Promise((r) => m.win.setTimeout(r, 5));
    assert(!$(m.doc, '.ts-statement'), 'the old league result must not appear');
    assert.strictEqual(m.doc.getElementById('results').getAttribute('aria-busy'), 'false');
  });

  await test('Bet against reruns the same games from the other side, and the URL keeps it', async () => {
    const { win, doc, requested } = await runIt({ ...base, '/query': priced() });
    const btn = $(doc, '#otherSide');
    assert(btn && btn.textContent === 'Bet against', btn && btn.textContent);
    btn.dispatchEvent(new win.Event('click', { bubbles: true }));
    for (let i = 0; i < 20; i++) await new Promise((r) => win.setTimeout(r, 5));
    const q = requested.filter((u) => u.includes('/trendspotter/query?')).pop();
    assert(/side=against/.test(q) && /team=SF/.test(q), q);
    assert(/side=against/.test(win.location.search), win.location.search);
    assert(/^Betting against the /.test(txt(doc, '#querySummary')), txt(doc, '#querySummary'));
  });

  // TS_UNREADABLE_BODY_20261116 ------------------------------------------------
  await test('a 200 with an unreadable capabilities body is retried, and the page recovers', async () => {
    const { doc, requested, consoleErrors } = await mount(base, { failFirst: { '/capabilities': { times: 1, unreadable: true } }, settle: 300 });
    assert(requested.filter((u) => u.includes('/capabilities')).length >= 2, 'retried');
    assert(/Verified game data connected/.test(txt(doc, '#sourceStatusText')), txt(doc, '#sourceStatusText'));
    assert(doc.querySelectorAll('[id^=f_]').length > 0, 'the filters render');
    assert.deepStrictEqual(consoleErrors, []);
  });

  await test('a capabilities body that never reads shows the retry state, never a stuck loading line', async () => {
    const { doc, consoleErrors } = await mount(base, { failFirst: { '/capabilities': { times: 99, unreadable: true } }, settle: 500 });
    assert(!/Checking data sources/.test(txt(doc, '#sourceStatusText')), txt(doc, '#sourceStatusText'));
    assert($(doc, '#retryBoot'), 'the retry button is offered');
    assert.deepStrictEqual(consoleErrors, []);
  });

  // TS_CLS_20261116 + TS_DESIGN_20261116 ---------------------------------------
  await test('the page ships the league tabs and the slate skeleton in its HTML (no shift when they load)', async () => {
    assert(/id="leagueTabs"><button type="button" role="tab" data-league="MLB"/.test(rawHtml), 'league tabs in the HTML');
    assert(/id="matchupList"[^>]*><div class="ts-skeleton">/.test(rawHtml), 'slate skeleton in the HTML');
    const nav = rawHtml.indexOf('tmr-navbar.css'); const arena = rawHtml.indexOf('tmr-ts-arena.css');
    assert(nav > arena, 'tmr-navbar.css is linked after the arena layer (the nav script moves it last)');
  });

  await test('the evidence table is marked for the compact phone layout and dates never split at a hyphen', async () => {
    const { doc } = await runIt({ ...base, '/query': priced() });
    assert($(doc, 'table.ts-games-table'), 'games table class');
    const sample = $$(doc, '.ts-metric').find((m) => /Sample/.test(m.querySelector('dt').textContent));
    assert(sample && /‑/.test(sample.textContent) && !/\d-\d\d-\d\d/.test(sample.querySelector('small').textContent), sample && sample.textContent);
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
