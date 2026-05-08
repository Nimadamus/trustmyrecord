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

function currentDateIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function makeTrend(overrides = {}) {
  return {
    rank: 4,
    sport: 'MLB',
    matchup: 'Magic @ Pistons',
    team_abbr: 'ORL',
    opponent_abbr: 'DET',
    home_abbr: 'DET',
    away_abbr: 'ORL',
    bet_type: 'TEAM_TOTAL',
    trend_type: 'SCORING',
    claim: 'The Magic have scored OVER 103.5 points in 43 of their last 50 vs a team on a 2+ game losing streak',
    sample: 50,
    dominance: 0.86,
    date_range: '2024-03-05 to 2026-04-05',
    source_url: 'https://www.espn.com/nba/team/schedule/_/name/orl',
    game_dates: ['2026-04-05'],
    game_log: ['2026-04-05  @ New Orleans Pelicans            112-108  W'],
    is_current: true,
    is_archived: false,
    artifact_slate_date: currentDateIso(),
    ...overrides,
  };
}

async function bootWithData(dataBySport) {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (msg) => consoleErrors.push(String(msg)));
  virtualConsole.on('jsdomError', (err) => consoleErrors.push(err.message));
  const dom = new JSDOM(html, {
    url: 'https://trustmyrecord.com/trendspotter/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  });
  dom.consoleErrors = consoleErrors;
  dom.window.CONFIG = { api: { baseUrl: 'https://trustmyrecord-api.onrender.com/api' } };
  dom.window.fetch = async (url) => {
    const sport = new URL(url).searchParams.get('sport');
    return {
      ok: true,
      json: async () => dataBySport[sport] || { status: 'missing', trends: [] },
    };
  };
  dom.window.eval(js);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return dom;
}

async function selectSport(dom, sport = 'MLB') {
  const doc = dom.window.document;
  doc.querySelector(`[data-sport="${sport}"]`).click();
  await new Promise((resolve) => setTimeout(resolve, 30));
}

function selectFirstMatchup(doc) {
  const matchup = doc.querySelector('#matchupFilter');
  const value = Array.from(matchup.options).find((option) => option.value)?.value;
  assert(value, 'matchup selector should include a current-slate matchup');
  changeSelect(doc, '#matchupFilter', value);
}

function changeSelect(doc, selector, value) {
  const el = doc.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
}

(async () => {
  const validData = {
    MLB: {
      status: 'fresh',
      generated_at: `${currentDateIso()}T10:00:00.000Z`,
      trends: [
        makeTrend(),
        makeTrend({
          rank: 5,
          team_abbr: 'DET',
          opponent_abbr: 'ORL',
          home_abbr: 'DET',
          away_abbr: 'ORL',
          bet_type: 'MONEYLINE',
          trend_type: 'RECORD',
          claim: 'The Pistons are 1-1 in their last 2 after a win',
          sample: 2,
          dominance: 0.5,
          unit_basis: '1 unit flat stake',
          source_rows: [
            {
              date: '2026-04-05',
              opponent: 'vs Orlando Magic',
              market_result: 'WIN',
              odds: -120,
              unit_basis: '1 unit flat stake',
              raw_game_log: '2026-04-05 vs Orlando Magic 110-101 W',
              why_counted: 'Matched after-win moneyline selector.',
              source_url: 'https://www.espn.com/nba/team/schedule/_/name/det',
            },
            {
              date: '2026-04-02',
              opponent: '@ Boston Celtics',
              market_result: 'LOSS',
              odds: 140,
              unit_basis: '1 unit flat stake',
              raw_game_log: '2026-04-02 @ Boston Celtics 101-106 L',
              why_counted: 'Matched after-win moneyline selector.',
              source_url: 'https://www.espn.com/nba/team/schedule/_/name/det',
            },
          ],
          excluded_games: [
            {
              date: '2026-03-29',
              opponent: 'vs Miami Heat',
              reason: 'missing odds',
              source_url: 'https://www.espn.com/nba/team/schedule/_/name/det',
            },
          ],
        }),
      ],
    },
  };

  const dom = await bootWithData(validData);
  const doc = dom.window.document;

  assert(doc.querySelector('#marketType'), 'market type filter should render');
  assert(doc.querySelector('#matchupFilter'), 'matchup selector should render before market type');
  assert(doc.body.textContent.indexOf('Choose Matchup') < doc.body.textContent.indexOf('Choose Market Type'), 'matchup step should appear before market step');
  assert(doc.querySelector('#trendFactor'), 'trend factor filter should render');
  assert(doc.querySelector('#minSample'), 'sample size filter should render');
  assert(doc.querySelector('#minWinPct'), 'win percentage threshold filter should render');
  assert(doc.querySelector('#researchMode'), 'research mode filter should render');
  assert(doc.querySelector('#currentMatchupOnly'), 'current matchup toggle should render');
  assert(doc.querySelector('#sortBy'), 'sort filter should render');

  await selectSport(dom);
  selectFirstMatchup(doc);
  assert.strictEqual(doc.querySelector('#teamFilter').value, 'both', 'team filter initializes to both teams after matchup selection');
  assert.deepStrictEqual(
    Array.from(doc.querySelector('#teamFilter').options).map((option) => option.textContent),
    ['Both teams', 'ORL (away)', 'DET (home)'],
    'team selector should only show the selected matchup teams and both teams'
  );
  doc.querySelector('#runTrendspotter').click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 2, 'sport filter should render sport trends');
  assert.match(doc.querySelector('.ts-result-item').textContent, /Current Slate/, 'current trends should be visibly labeled');
  assert.match(doc.querySelector('#slateDateIndicator').textContent, new RegExp(currentDateIso()), 'selected query should display current slate date');
  assert.strictEqual(doc.querySelectorAll('.ts-rank').length, 0, 'rank numbers should be removed from cards');

  await selectSport(dom, 'NHL');
  assert.strictEqual(doc.querySelector('#matchupFilter').disabled, true, 'non-MLB current sports should not show live-board matchups in MLB-only release');
  assert.match(doc.querySelector('#matchupDataSource').textContent, /MLB-only in this release/, 'non-MLB current sports should be explicitly labeled unavailable');
  assert.match(doc.querySelector('#slateDateIndicator').textContent, /MLB-only release/, 'query slate indicator should not imply non-MLB current support');
  assert.strictEqual(doc.querySelector('#runTrendspotter').disabled, true, 'non-MLB unavailable sports cannot generate current trends');
  await selectSport(dom, 'MLB');
  selectFirstMatchup(doc);
  doc.querySelector('#runTrendspotter').click();

  assert(!doc.querySelector('.ts-result-item').textContent.includes('ROI / units'), 'ROI hidden when odds/results/unit basis are unavailable');
  assert.match(doc.querySelector('.ts-result-item').textContent, /Applies because/, 'cards should explain why a trend applies today');
  assert.match(doc.querySelector('.ts-result-item').textContent, /Current opponent: DET/, 'applies-because context should include current opponent');
  assert.match(doc.querySelector('.ts-result-item').textContent, /Trend Strength/, 'transparent strength should render');
  assert.match(doc.querySelector('.ts-result-item').textContent, /Strength reason/, 'strength reason should render');

  changeSelect(doc, '#marketType', 'team_total');
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 1, 'market type filter should update cards');
  assert.match(doc.querySelector('.ts-claim').textContent, /Magic have scored/);

  changeSelect(doc, '#trendFactor', 'scoring');
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 1, 'trend factor filter should update cards');

  doc.querySelector('#minSample').value = '51';
  doc.querySelector('#minSample').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 0, 'sample size filter should remove smaller samples');
  assert.match(doc.querySelector('.ts-no-results').textContent, /No verified trends match/);

  doc.querySelector('#minSample').value = '0';
  doc.querySelector('#minSample').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  doc.querySelector('#minWinPct').value = '88';
  doc.querySelector('#minWinPct').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 0, 'win percentage threshold should filter cards');
  doc.querySelector('#minWinPct').value = '0';
  doc.querySelector('#minWinPct').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  doc.querySelector('#currentMatchupOnly').checked = true;
  doc.querySelector('#currentMatchupOnly').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 1, 'current matchup toggle should preserve valid matchup cards');
  doc.querySelector('#currentMatchupOnly').checked = false;
  doc.querySelector('#currentMatchupOnly').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  changeSelect(doc, '#sortBy', 'sample');
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 1, 'sorting should preserve filtered cards');

  changeSelect(doc, '#trendFactor', 'all');
  changeSelect(doc, '#marketType', 'moneyline');
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 1, 'moneyline filter should isolate verified ROI test trend');
  assert.match(doc.querySelector('.ts-result-item').textContent, /Average odds/, 'average odds shown when row odds are verified');
  assert.match(doc.querySelector('.ts-result-item').textContent, /ROI \/ units/, 'ROI shown only with verified odds/results/unit basis');

  doc.querySelector('[data-source-id]').click();
  assert(!doc.querySelector('#sourceModal').classList.contains('is-hidden'), 'verified source should open supporting data');
  assert.match(doc.querySelector('#sourceModalBody').textContent, /Orlando Magic/);
  assert.match(doc.querySelector('#sourceModalBody').textContent, /Why counted/);
  assert.match(doc.querySelector('#sourceModalBody').textContent, /missing odds/, 'excluded games should display when available');

  doc.querySelector('[data-detail-toggle]').click();
  assert(!doc.querySelector('.ts-detail-panel').classList.contains('is-hidden'), 'detail panel should expand');
  assert.match(doc.querySelector('.ts-detail-panel').textContent, /Exact query\/filter/);
  assert.match(doc.querySelector('.ts-detail-panel').textContent, /Applies because/);
  assert.match(doc.querySelector('.ts-detail-panel').textContent, /Strength formula/);

  const corruptedData = {
    MLB: {
      status: 'fresh',
      trends: [
        makeTrend({ claim: '' }),
        makeTrend({ matchup: 'Incomplete @ Missing', source_url: '' }),
        makeTrend({ matchup: 'No Log @ Missing', game_log: [] }),
      ],
    },
  };
  const corruptedDom = await bootWithData(corruptedData);
  await selectSport(corruptedDom);
  assert.strictEqual(corruptedDom.window.document.querySelector('#matchupFilter').disabled, true, 'invalid trends should not create matchup options');
  corruptedDom.window.document.querySelector('#runTrendspotter').click();
  assert.strictEqual(corruptedDom.window.document.querySelectorAll('.ts-result-item').length, 0, 'incomplete trends must not render results');

  const archivedDom = await bootWithData({
    MLB: {
      status: 'archived',
      is_current: false,
      is_archived: true,
      artifact_slate_date: '2026-04-29',
      staleness_reason: `Artifact slate date 2026-04-29 is before current date ${currentDateIso()}.`,
      trends: [
        makeTrend({
          is_current: false,
          is_archived: true,
          artifact_slate_date: '2026-04-29',
          staleness_reason: `Artifact slate date 2026-04-29 is before current date ${currentDateIso()}.`,
        }),
      ],
    },
  });
  await selectSport(archivedDom);
  archivedDom.window.document.querySelector('#runTrendspotter').click();
  assert.strictEqual(archivedDom.window.document.querySelectorAll('.ts-result-item').length, 0, 'archived artifacts must not render in current slate mode');
  assert.strictEqual(archivedDom.window.document.querySelector('#matchupFilter').disabled, true, 'archived matchups should not populate current slate selector');
  changeSelect(archivedDom.window.document, '#researchMode', 'archived');
  selectFirstMatchup(archivedDom.window.document);
  archivedDom.window.document.querySelector('#runTrendspotter').click();
  assert.strictEqual(archivedDom.window.document.querySelectorAll('.ts-result-item').length, 1, 'archived research should render only in archived mode');
  assert.match(archivedDom.window.document.querySelector('.ts-result-item').textContent, /Archived Research/);
  assert.match(archivedDom.window.document.querySelector('.ts-result-item').textContent, /before current date/);

  assert(css.includes('@media (max-width: 860px)'), 'mobile layout media query should exist');
  assert.strictEqual(dom.consoleErrors.length, 0, `no console errors expected: ${dom.consoleErrors.join('; ')}`);

  console.log('Trendspotter accuracy frontend tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
