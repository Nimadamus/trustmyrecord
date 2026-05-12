const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'trendspotter', 'index.html'), 'utf8')
  .replace(/<script src="\/static\/js\/config\.js[^>]*><\/script>/, '')
  .replace(/<script src="\/static\/js\/trendspotter\.js[^>]*><\/script>/, '');
const js = fs.readFileSync(path.join(root, 'static', 'js', 'trendspotter.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'static', 'css', 'trendspotter.css'), 'utf8');

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
  side: 'OVER',
  claim: 'Verified source rows matched this total-market query.',
  sample: 14,
  date_range: `${today()} to ${today()}`,
  source_url: 'https://example.test/source',
  artifact_slate_date: today(),
  source_rows: [
    { date: today(), raw_game_log: 'Mets @ Rockies verified source row', why_counted: 'Matched selected market and matchup.' },
  ],
};

const teamTotalTrend = {
  ...verifiedTrend,
  bet_type: 'TEAM_TOTAL',
  side: 'OVER',
  claim: 'Verified source rows matched this team-total query.',
  team_abbr: 'Colorado Rockies',
  opponent_abbr: 'New York Mets',
  source_rows: [
    { date: today(), raw_game_log: 'Rockies team-total verified source row', why_counted: 'Matched team total selector.' },
  ],
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

(async () => {
  const dom = await boot({
    MLB: {
      status: 'current',
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
      trends: [verifiedTrend, teamTotalTrend],
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
  assert(doc.querySelector('[data-market="props"]').disabled, 'unsupported props must be disabled');

  await chooseSport(doc, 'MLB');
  chooseFirstMatchup(doc);
  assert.match(doc.querySelector('#selectionSummary').textContent, /New York Mets @ Colorado Rockies/, 'matchup selection should update summary');

  clickMarket(doc, 'moneyline');
  assert.strictEqual(doc.querySelector('#thresholdField').classList.contains('is-hidden'), true, 'moneyline should not show total threshold');
  assert.strictEqual(doc.querySelector('#teamField').classList.contains('is-hidden'), true, 'moneyline should not require team-total team field');
  assert.match(doc.querySelector('#sideSelect').textContent, /New York Mets away/, 'moneyline side should use matchup teams');

  clickMarket(doc, 'total');
  assert.strictEqual(doc.querySelector('#thresholdField').classList.contains('is-hidden'), false, 'total should show threshold');
  assert.strictEqual(doc.querySelector('#teamField').classList.contains('is-hidden'), true, 'game total should not require team selector');
  assert.match(doc.querySelector('#sideSelect').textContent, /Over/, 'total should show over/under side');
  change(doc, '#sideSelect', 'over');
  change(doc, '#thresholdInput', '8.5');
  doc.querySelector('#generateTrend').click();
  assert.strictEqual(doc.querySelectorAll('[data-result="verified-trend"]').length, 1, 'total query should generate matching verified result');
  assert.match(doc.querySelector('#resultsList').textContent, /Selected market\s*Total/, 'result should reflect selected market');
  assert.match(doc.querySelector('#resultsList').textContent, /Selected side\s*over/, 'result should reflect selected side');
  assert.match(doc.querySelector('#resultsList').textContent, /line=8.5/, 'result should reflect selected threshold');
  assert.match(doc.querySelector('#resultsList').textContent, /Sample size\s*14/, 'result should show sample size');

  clickMarket(doc, 'team_total');
  assert.strictEqual(doc.querySelector('#teamField').classList.contains('is-hidden'), false, 'team total must require team selection');
  assert.strictEqual(doc.querySelector('#generateTrend').disabled, true, 'team total should block generation without team');
  change(doc, '#sideSelect', 'over');
  change(doc, '#teamSelect', 'Colorado Rockies');
  change(doc, '#thresholdInput', '4.5');
  assert.strictEqual(doc.querySelector('#generateTrend').disabled, false, 'team total should allow generation after required variables');
  doc.querySelector('#generateTrend').click();
  assert.match(doc.querySelector('#resultsList').textContent, /Selected team\s*Colorado Rockies/, 'team total result should reflect selected team');

  clickMarket(doc, 'first_five');
  assert.match(doc.querySelector('#periodSelect').textContent, /First five innings/, 'first five should appear for MLB');

  await chooseSport(doc, 'NBA');
  assert.strictEqual(doc.querySelector('[data-market="first_five"]').disabled, true, 'first five must be disabled outside MLB');
  assert.strictEqual(doc.querySelector('[data-market="props"]').disabled, true, 'props stay disabled for unsupported markets');

  const noDataDom = await boot({ MLB: { status: 'missing', trends: [], matchups: [] } });
  const noDataDoc = noDataDom.window.document;
  await chooseSport(noDataDoc, 'MLB');
  chooseFirstMatchup(noDataDoc);
  clickMarket(noDataDoc, 'total');
  change(noDataDoc, '#sideSelect', 'over');
  change(noDataDoc, '#thresholdInput', '8.5');
  noDataDoc.querySelector('#generateTrend').click();
  assert.match(noDataDoc.querySelector('[data-state="safe-no-data"]').textContent, /No verified trend available|No strong trend found|Verified trend data source not connected/, 'safe no-data state should render');

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
