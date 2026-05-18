const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(root, 'trendspotter', 'index.html'), 'utf8');
const html = rawHtml
  .replace(/<script src="\/static\/js\/config\.js[^>]*><\/script>/, '')
  .replace(/<script src="\/static\/js\/trendspotter\.js[^>]*><\/script>/, '');
const js = fs.readFileSync(path.join(root, 'static', 'js', 'trendspotter.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'static', 'css', 'trendspotter.css'), 'utf8');

assert(/\/static\/css\/trendspotter\.css\?v=20260518-generate2/.test(rawHtml), 'Trend Spotter page uses the current stylesheet cache key');
assert(/\/static\/js\/trendspotter\.js\?v=20260518-generate2/.test(rawHtml), 'Trend Spotter page uses the current script cache key');
assert(!/20260512labels1/.test(rawHtml + js + css), 'stale Trend Spotter deployment labels are removed');
assert(!/Verified trend data source not connected yet/i.test(rawHtml + js + css), 'raw backend placeholder text must not ship in Trend Spotter UI');

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const verifiedTrend = {
  sport: 'MLB',
  matchup: 'New York Mets @ Colorado Rockies',
  away_abbr: 'New York Mets',
  home_abbr: 'Colorado Rockies',
  team_abbr: 'New York Mets',
  opponent_abbr: 'Colorado Rockies',
  bet_type: 'TOTAL',
  kind: 'SCORING',
  trend_type: 'SCORING',
  side: 'OVER',
  claim: 'Verified source rows matched this total-market query.',
  sample: 14,
  date_range: `${today()} to ${today()}`,
  source_url: 'https://example.test/source',
  source_classification: 'source_backed',
  source_classification_detail: 'completed_mlb_games_with_final_scores',
  artifact_slate_date: today(),
  source_rows: [
    { date: today(), raw_game_log: 'Mets @ Rockies verified source row', total_line: 8.5, why_counted: 'Matched selected market and matchup.' },
  ],
};

const moneylineTrend = {
  ...verifiedTrend,
  bet_type: 'MONEYLINE',
  market: 'MONEYLINE',
  kind: 'RECENT_FORM',
  trend_type: 'RECENT_FORM',
  side: 'all',
  claim: 'Verified source rows matched this moneyline query.',
  source_rows: [
    { date: today(), raw_game_log: 'Mets @ Braves verified moneyline row WIN', market_result: 'WIN', why_counted: 'Matched selected moneyline team trend.' },
    { date: today(), raw_game_log: 'Mets @ Phillies verified moneyline row LOSS', market_result: 'LOSS', why_counted: 'Matched selected moneyline team trend.' },
    { date: today(), raw_game_log: 'Mets @ Marlins verified moneyline row WIN', market_result: 'WIN', why_counted: 'Matched selected moneyline team trend.' },
  ],
  sample: 3,
};

const spreadTrend = {
  ...verifiedTrend,
  bet_type: 'SPREAD',
  market: 'SPREAD',
  kind: 'SPREAD',
  trend_type: 'SPREAD',
  side: 'all',
  claim: 'Verified source rows matched this spread query.',
  source_rows: [
    { date: today(), raw_game_log: 'Mets @ Braves verified spread row WIN', line: 1.5, market_result: 'WIN', why_counted: 'Matched selected spread line.' },
    { date: today(), raw_game_log: 'Mets @ Phillies verified spread row WIN', line: 1.5, market_result: 'WIN', why_counted: 'Matched selected spread line.' },
    { date: today(), raw_game_log: 'Mets @ Marlins verified spread row LOSS', line: 1.5, market_result: 'LOSS', why_counted: 'Matched selected spread line.' },
  ],
  sample: 3,
};

const teamTotalTrend = {
  ...verifiedTrend,
  bet_type: 'TEAM_TOTAL',
  market: 'TEAM_TOTAL',
  kind: 'TEAM_TOTAL',
  trend_type: 'TEAM_TOTAL',
  side: 'OVER',
  claim: 'New York Mets team total OVER is source-backed by verified team-total rows.',
  source_rows: [
    { date: today(), raw_game_log: 'Mets @ Braves verified team-total row WIN', team: 'New York Mets', team_total_line: 4.5, team_total_score: 6, market_result: 'WIN', why_counted: 'Matched selected team-total line.' },
    { date: today(), raw_game_log: 'Mets @ Phillies verified team-total row WIN', team: 'New York Mets', team_total_line: 4.5, team_total_score: 5, market_result: 'WIN', why_counted: 'Matched selected team-total line.' },
    { date: today(), raw_game_log: 'Mets @ Marlins verified team-total row LOSS', team: 'New York Mets', team_total_line: 4.5, team_total_score: 3, market_result: 'LOSS', why_counted: 'Matched selected team-total line.' },
  ],
  sample: 3,
};

const genericTeamTotalTrend = {
  ...teamTotalTrend,
  source_rows: [
    { date: today(), raw_game_log: 'Mets @ Braves generic total-line row WIN', team: 'New York Mets', total_line: 8.5, market_result: 'WIN', why_counted: 'This row intentionally lacks team-total line data.' },
  ],
};

const unlinedTotalTrend = {
  ...verifiedTrend,
  source_rows: [
    { date: today(), raw_game_log: 'Mets @ Rockies unlined source row', why_counted: 'No line was supplied.' },
  ],
};

const estimatedTrend = {
  ...verifiedTrend,
  claim: 'Estimated total line should never render as a verified trend.',
  estimated_line: true,
  source_classification: 'estimated',
};

async function boot(dataBySport = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (msg) => errors.push(String(msg)));
  virtualConsole.on('jsdomError', (err) => errors.push(err.message));
  const dom = new JSDOM(html, {
    url: 'https://trustmyrecord.com/trendspotter/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  });
  dom.consoleErrors = errors;
  dom.window.CONFIG = { api: { baseUrl: 'https://trustmyrecord-api.onrender.com/api' } };
  dom.window.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/games/board/')) {
      return {
        ok: true,
        json: async () => ({
          games: [
            {
              away_team: 'New York Mets',
              home_team: 'Colorado Rockies',
              commence_time: `${today()}T19:10:00Z`,
            },
          ],
          diagnostics: { source: 'test schedule' },
        }),
      };
    }
    const sport = parsed.searchParams.get('sport');
    return {
      ok: true,
      json: async () => dataBySport[sport] || { status: 'missing', trends: [], matchups: [] },
    };
  };
  dom.window.eval(js);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return dom;
}

function change(doc, selector, value) {
  const el = doc.querySelector(selector);
  assert(el, `${selector} should exist`);
  el.value = value;
  el.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  el.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
}

async function chooseSport(doc, sport = 'MLB') {
  change(doc, '#sportSelect', sport);
  await new Promise((resolve) => setTimeout(resolve, 30));
}

function chooseFirstMatchup(doc) {
  const option = Array.from(doc.querySelector('#matchupSelect').options).find((item) => item.value);
  assert(option, 'matchup selector should have a selectable matchup');
  change(doc, '#matchupSelect', option.value);
}

function clickMarket(doc, market) {
  const button = doc.querySelector(`[data-market="${market}"]`);
  assert(button, `${market} market button should exist`);
  button.click();
}

function chooseTrendKind(doc, value) {
  change(doc, '#trendKindSelect', value);
}

(async () => {
  const dom = await boot({
    MLB: {
      status: 'current',
      source: 'source_backed_historical_database',
      source_classification: 'source_backed',
      source_classification_detail: 'completed_mlb_games_with_final_scores',
      estimated_totals_policy: {
        status: 'blocked',
        applies_to: ['MLB', 'NFL'],
        blocked_rows: 0,
        message: 'Estimated total lines are excluded from source-backed Trendspotter trend generation.',
      },      
      matchup_source: 'Verified test artifact',
      matchups: [
        {
          sport: 'MLB',
          matchup: 'New York Mets @ Colorado Rockies',
          away_abbr: 'New York Mets',
          home_abbr: 'Colorado Rockies',
          slate_date: today(),
          game_time: `${today()}T19:10:00Z`,
        },
      ],
      trends: [moneylineTrend, spreadTrend, verifiedTrend, teamTotalTrend],
    },
  });
  const doc = dom.window.document;

  assert(doc.querySelector('#sportSelect'), 'sport selector should render');
  assert(doc.querySelector('#matchupSelect'), 'matchup selector should render');
  assert(doc.querySelector('[data-market="moneyline"]'), 'moneyline market should render');
  assert(doc.querySelector('[data-market="spread"]'), 'spread market should render');
  assert(doc.querySelector('[data-market="total"]'), 'total market should render');
  assert(doc.querySelector('[data-market="team_total"]'), 'team total market should render');
  assert(doc.querySelector('[data-market="first_half"]'), 'first half market should render');
  assert(doc.querySelector('[data-market="first_five"]'), 'first five market should render');
  assert(doc.querySelector('[data-market="team_total"]').disabled, 'team totals must be disabled until a sport with verified team-total rows is loaded');
  assert(doc.querySelector('[data-market="first_half"]').disabled, 'first half trends must be disabled until verified source support exists');
  assert(doc.querySelector('[data-market="first_five"]').disabled, 'first five trends must be disabled until verified source support exists');
  assert(doc.querySelector('[data-market="props"]').disabled, 'unsupported props must be disabled');
  assert.match(doc.querySelector('#rangeSelect').textContent, /Last 5 games - requires time-window dataset/, 'unsupported time-window filters should be visible but disabled');
  assert.match(doc.body.textContent, /Source-backed/, 'data policy should show source-backed classification');
  assert.match(doc.body.textContent, /Partial \/ blocked/, 'data policy should show partial and blocked classification');
  assert.match(doc.body.textContent, /Unsupported \/ estimated/, 'data policy should show unsupported and estimated classification');

  await chooseSport(doc, 'MLB');
  chooseFirstMatchup(doc);
  assert.match(doc.querySelector('#selectionSummary').textContent, /New York Mets @ Colorado Rockies/, 'matchup selection should update summary');
  assert.strictEqual(doc.querySelector('[data-market="team_total"]').disabled, false, 'team totals should be usable when verified team-total source rows exist');

  clickMarket(doc, 'moneyline');
  assert.match(doc.querySelector('#trendKindSelect').textContent, /Team win trend/, 'moneyline trend search should render moneyline options');
  assert(!/Full game over/i.test(doc.querySelector('#trendKindSelect').textContent), 'moneyline trend search should not show total-only trend options');
  assert.strictEqual(doc.querySelector('#thresholdField').classList.contains('is-hidden'), true, 'moneyline should not show total threshold');
  assert.strictEqual(doc.querySelector('#teamField').classList.contains('is-hidden'), true, 'moneyline should not require team-total team field');
  assert.match(doc.querySelector('#sideSelect').textContent, /New York Mets away/, 'moneyline side should use matchup teams');
  chooseTrendKind(doc, 'team_win');
  change(doc, '#sideSelect', 'away');
  change(doc, '#sampleInput', '3');
  assert.strictEqual(doc.querySelector('#generateTrend').disabled, false, 'moneyline should allow verified generation after team side and trend search');
  doc.querySelector('#generateTrend').click();
  assert.match(doc.querySelector('#resultsList').textContent, /Selected market\s*Moneyline/, 'moneyline result should reflect selected market');
  assert.match(doc.querySelector('#resultsList').textContent, /Sample size\s*3/, 'moneyline result should show sample size');

  clickMarket(doc, 'spread');
  chooseTrendKind(doc, 'ats');
  change(doc, '#sideSelect', 'away');
  assert.strictEqual(doc.querySelector('#generateTrend').disabled, true, 'spread should require a numeric threshold before generation');
  change(doc, '#thresholdInput', '1.5');
  assert.strictEqual(doc.querySelector('#generateTrend').disabled, false, 'spread should allow generation when a matching source line exists');
  doc.querySelector('#generateTrend').click();
  assert.match(doc.querySelector('#resultsList').textContent, /Selected market\s*Spread/, 'spread result should reflect selected market');
  assert.match(doc.querySelector('#resultsList').textContent, /line=1.5/, 'spread result should reflect selected source-matched threshold');
  change(doc, '#thresholdInput', '2.5');
  doc.querySelector('#generateTrend').click();
  assert.strictEqual(doc.querySelectorAll('[data-result="verified-trend"]').length, 0, 'spread should not render when selected line does not match source line data');
  change(doc, '#thresholdInput', '1.5');

  clickMarket(doc, 'total');
  assert.match(doc.querySelector('#trendKindSelect').textContent, /Full game over \/ under/, 'total trend search should render over-under options');
  assert(!/After a win/i.test(doc.querySelector('#trendKindSelect').textContent), 'total trend search should not show moneyline-only sequence options');
  assert.strictEqual(doc.querySelector('#thresholdField').classList.contains('is-hidden'), false, 'total should show threshold');
  assert.strictEqual(doc.querySelector('#teamField').classList.contains('is-hidden'), true, 'game total should not require team selector');
  assert.match(doc.querySelector('#sideSelect').textContent, /Over/, 'total should show over/under side');
  assert.strictEqual(doc.querySelector('#generateTrend').disabled, true, 'total should block generation until trend search is selected');
  chooseTrendKind(doc, 'full_game_over_under');
  change(doc, '#sideSelect', 'over');
  assert.strictEqual(doc.querySelector('#generateTrend').disabled, true, 'threshold markets should block generation until a numeric line is supplied');
  change(doc, '#thresholdInput', '8.5');
  doc.querySelector('#generateTrend').click();
  assert.strictEqual(doc.querySelectorAll('[data-result="verified-trend"]').length, 1, 'total query should generate matching verified result');
  assert.match(doc.querySelector('#resultsList').textContent, /Selected market\s*Total/, 'result should reflect selected market');
  assert.match(doc.querySelector('#resultsList').textContent, /Trend search\s*Full game over \/ under/, 'result should reflect selected trend search');
  assert.match(doc.querySelector('#resultsList').textContent, /Selected side\s*over/, 'result should reflect selected side');
  assert.match(doc.querySelector('#resultsList').textContent, /line=8.5/, 'result should reflect selected threshold');
  assert.match(doc.querySelector('#resultsList').textContent, /Sample size\s*14/, 'result should show sample size');
  assert.match(doc.querySelector('#resultsList').textContent, /Source classification\s*Source-backed/, 'result should expose source classification');
  assert.strictEqual(doc.querySelector('[data-result="verified-trend"]').getAttribute('data-source-label'), 'source-backed', 'verified result should carry source-backed label');
  assert.match(doc.querySelector('#resultsList').textContent, /This is a trend, not a betting recommendation/, 'result should include non-pick note');

  change(doc, '#sampleInput', '15');
  doc.querySelector('#generateTrend').click();
  assert.match(doc.querySelector('#resultsList').textContent, /Small sample warning/, 'above-sample query should render the small-sample state instead of hiding the matching trend');
  change(doc, '#sampleInput', '10');

  clickMarket(doc, 'team_total');
  change(doc, '#sampleInput', '3');
  assert.match(doc.querySelector('#trendKindSelect').textContent, /Team total over \/ under/, 'team-total trend search should render only source-backed team-total options');
  assert.strictEqual(doc.querySelector('#periodSelect').value, 'full_game', 'team totals should only expose full-game period until period-specific rows exist');
  chooseTrendKind(doc, 'team_total_over_under');
  change(doc, '#sideSelect', 'over');
  change(doc, '#teamSelect', 'New York Mets');
  assert.strictEqual(doc.querySelector('#generateTrend').disabled, true, 'team totals should require a numeric team-total line before generation');
  change(doc, '#thresholdInput', '4.5');
  assert.strictEqual(doc.querySelector('#generateTrend').disabled, false, 'team totals should allow generation when verified source line data exists');
  doc.querySelector('#generateTrend').click();
  assert.match(doc.querySelector('#resultsList').textContent, /Selected market\s*Team Total/, 'team-total result should reflect selected market');
  assert.match(doc.querySelector('#resultsList').textContent, /Selected team\s*New York Mets/, 'team-total result should reflect selected team');
  assert.match(doc.querySelector('#resultsList').textContent, /line=4.5/, 'team-total result should reflect selected source-matched threshold');
  change(doc, '#thresholdInput', '5.5');
  doc.querySelector('#generateTrend').click();
  assert.strictEqual(doc.querySelectorAll('[data-result="verified-trend"]').length, 0, 'team totals should not render when selected line does not match source team-total data');

  clickMarket(doc, 'first_five');
  assert.notStrictEqual(doc.querySelector('#selectionSummary').textContent.includes('First Five'), true, 'disabled first five should not become the selected market');
  assert.strictEqual(doc.querySelector('[data-market="first_five"]').disabled, true, 'disabled first five must not be usable');

  await chooseSport(doc, 'NBA');
  assert.strictEqual(doc.querySelector('[data-market="first_five"]').disabled, true, 'first five must be disabled outside MLB');
  assert.strictEqual(doc.querySelector('[data-market="team_total"]').disabled, true, 'team totals must be disabled when the loaded sport has no verified team-total source rows');
  assert.strictEqual(doc.querySelector('[data-market="props"]').disabled, true, 'props stay disabled for unsupported markets');

  const genericTeamTotalDom = await boot({
    MLB: {
      status: 'current',
      source: 'source_backed_historical_database',
      source_classification: 'source_backed',
      matchups: [
        {
          sport: 'MLB',
          matchup: 'New York Mets @ Colorado Rockies',
          away_abbr: 'New York Mets',
          home_abbr: 'Colorado Rockies',
          slate_date: today(),
          game_time: `${today()}T19:10:00Z`,
        },
      ],
      trends: [genericTeamTotalTrend],
    },
  });
  const genericTeamTotalDoc = genericTeamTotalDom.window.document;
  await chooseSport(genericTeamTotalDoc, 'MLB');
  chooseFirstMatchup(genericTeamTotalDoc);
  assert.strictEqual(
    genericTeamTotalDoc.querySelector('[data-market="team_total"]').disabled,
    true,
    'team-total market must not unlock from generic game-total line fields'
  );

  const noDataDom = await boot({ MLB: { status: 'missing', trends: [], matchups: [] } });
  const noDataDoc = noDataDom.window.document;
  await chooseSport(noDataDoc, 'MLB');
  chooseFirstMatchup(noDataDoc);
  clickMarket(noDataDoc, 'total');
  chooseTrendKind(noDataDoc, 'full_game_over_under');
  change(noDataDoc, '#sideSelect', 'over');
  change(noDataDoc, '#thresholdInput', '8.5');
  noDataDoc.querySelector('#generateTrend').click();
  assert.match(noDataDoc.querySelector('[data-state="safe-no-data"]').textContent, /No verified trend available|No strong trend found|Verified trend data is unavailable/, 'safe no-data state should render');
  assert.doesNotMatch(noDataDoc.body.textContent, /Verified trend data source not connected yet/, 'safe no-data state must not expose raw placeholder copy');
  assert.match(noDataDoc.querySelector('[data-state="safe-no-data"]').textContent, /Source classification:\s*(Partial|Blocked|Source-backed)/, 'safe state should expose source classification');
  assert(noDataDoc.querySelector('[data-state="safe-no-data"]').getAttribute('data-source-label'), 'safe state should carry a source label attribute');

  const unlinedDom = await boot({
    MLB: {
      status: 'current',
      source: 'source_backed_historical_database',
      source_classification: 'source_backed',
      matchups: [
        {
          sport: 'MLB',
          matchup: 'New York Mets @ Colorado Rockies',
          away_abbr: 'New York Mets',
          home_abbr: 'Colorado Rockies',
          slate_date: today(),
          game_time: `${today()}T19:10:00Z`,
        },
      ],
      trends: [unlinedTotalTrend],
    },
  });
  const unlinedDoc = unlinedDom.window.document;
  await chooseSport(unlinedDoc, 'MLB');
  chooseFirstMatchup(unlinedDoc);
  clickMarket(unlinedDoc, 'total');
  chooseTrendKind(unlinedDoc, 'full_game_over_under');
  change(unlinedDoc, '#sideSelect', 'over');
  change(unlinedDoc, '#thresholdInput', '8.5');
  unlinedDoc.querySelector('#generateTrend').click();
  assert.strictEqual(unlinedDoc.querySelectorAll('[data-result="verified-trend"]').length, 0, 'threshold-specific output must not render when source rows do not carry matching line data');
  assert.match(unlinedDoc.querySelector('[data-state="safe-no-data"]').textContent, /No strong trend found|No verified trend available/, 'unlined threshold trend should degrade to safe no-data');

  const estimatedDom = await boot({
    MLB: {
      status: 'current',
      source_classification: 'estimated',
      matchup_source: 'Estimated test source',
      matchups: [
        {
          sport: 'MLB',
          matchup: 'New York Mets @ Colorado Rockies',
          away_abbr: 'New York Mets',
          home_abbr: 'Colorado Rockies',
          slate_date: today(),
          game_time: `${today()}T19:10:00Z`,
        },
      ],
      trends: [estimatedTrend],
    },
  });
  const estimatedDoc = estimatedDom.window.document;
  await chooseSport(estimatedDoc, 'MLB');
  chooseFirstMatchup(estimatedDoc);
  clickMarket(estimatedDoc, 'total');
  chooseTrendKind(estimatedDoc, 'full_game_over_under');
  change(estimatedDoc, '#sideSelect', 'over');
  change(estimatedDoc, '#thresholdInput', '8.5');
  estimatedDoc.querySelector('#generateTrend').click();
  assert.strictEqual(estimatedDoc.querySelectorAll('[data-result="verified-trend"]').length, 0, 'estimated trends must not render as verified/source-backed results');
  assert.strictEqual(estimatedDoc.querySelector('[data-state="safe-no-data"]').getAttribute('data-source-label'), 'estimated', 'estimated source should be labeled estimated');
  assert.match(estimatedDoc.querySelector('[data-state="safe-no-data"]').textContent, /Source classification:\s*Estimated/, 'estimated source should be visibly labeled');
  assert(!/Source classification:\s*Source-backed/i.test(estimatedDoc.querySelector('[data-state="safe-no-data"]').textContent), 'estimated source must not masquerade as source-backed');

  const blockedDom = await boot();
  blockedDom.window.document.querySelector('#generateTrend').click();
  assert.strictEqual(blockedDom.window.document.querySelector('#generateTrend').disabled, true, 'generation should be blocked without required selections');
  assert.match(blockedDom.window.document.querySelector('#validationMessage').textContent, /Select a sport and matchup/, 'missing matchup validation should render');

  const visibleText = doc.body.textContent;
  ['fake ROI', 'fake win rate', 'fake records', 'fake predictions', 'fake backtests', 'fake leaderboards', 'fake marketplace', 'betting edge'].forEach((term) => {
    assert(!new RegExp(term, 'i').test(visibleText), `${term} should not appear in visible UI`);
  });

  assert(css.includes('.ts-market-grid'), 'market-aware layout styles should exist');
  assert(css.includes('@media (max-width: 860px)'), 'mobile layout media query should exist');
  assert.strictEqual(dom.consoleErrors.length, 0, `no console errors expected: ${dom.consoleErrors.join('; ')}`);

  console.log('Trend Spotter guided frontend tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
