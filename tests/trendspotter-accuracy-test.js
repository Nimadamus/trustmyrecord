const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'trendspotter', 'index.html'), 'utf8')
  .replace(/<script src="\/static\/js\/config\.js[^>]*><\/script>/, '')
  .replace(/<script src="\/static\/js\/trendspotter\.js[^>]*><\/script>/, '');
const js = fs.readFileSync(path.join(root, 'static', 'js', 'trendspotter.js'), 'utf8');

function makeTrend(overrides = {}) {
  return {
    rank: 4,
    sport: 'NBA',
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
    ...overrides,
  };
}

async function bootWithData(dataBySport) {
  const dom = new JSDOM(html, {
    url: 'https://trustmyrecord.com/trendspotter/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
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

async function selectSport(dom, sport = 'NBA') {
  const doc = dom.window.document;
  doc.querySelector(`[data-sport="${sport}"]`).click();
  await new Promise((resolve) => setTimeout(resolve, 30));
}

function changeSelect(doc, selector, value) {
  const el = doc.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
}

(async () => {
  const validData = {
    NBA: {
      status: 'fresh',
      generated_at: '2026-05-06T10:00:00.000Z',
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
          claim: 'The Pistons are 9-1 in their last 10 after a win',
          sample: 10,
          dominance: 0.9,
        }),
      ],
    },
  };

  const dom = await bootWithData(validData);
  const doc = dom.window.document;

  assert(doc.querySelector('#marketType'), 'market type filter should render');
  assert(doc.querySelector('#trendFactor'), 'trend factor filter should render');
  assert(doc.querySelector('#minSample'), 'sample size filter should render');
  assert(doc.querySelector('#sortBy'), 'sort filter should render');

  await selectSport(dom);
  assert.strictEqual(doc.querySelector('#teamFilter').value, 'all', 'team filter initializes after sport load');
  doc.querySelector('#runTrendspotter').click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 2, 'sport filter should render sport trends');
  assert.match(doc.querySelector('.ts-rank').textContent, /Trend Rank #4/, 'rank must be clearly labeled');
  assert.notStrictEqual(doc.querySelector('.ts-rank').textContent.trim(), '#4', 'rank must not be an unlabeled number');

  changeSelect(doc, '#marketType', 'team_total');
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 1, 'market type filter should update cards');
  assert.match(doc.querySelector('.ts-claim').textContent, /Magic have scored/);

  changeSelect(doc, '#marketType', 'total');
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 0, 'Total filter must not include Team Total trends');
  assert.match(doc.querySelector('.ts-no-results').textContent, /No verified Total trends available for this selection/);

  changeSelect(doc, '#marketType', 'moneyline');
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 1, 'Moneyline filter must only include Moneyline trends');
  assert.match(doc.querySelector('.ts-claim').textContent, /Pistons are 9-1/);

  changeSelect(doc, '#marketType', 'team_total');
  changeSelect(doc, '#trendFactor', 'scoring');
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 1, 'trend factor filter should update cards');

  doc.querySelector('#minSample').value = '51';
  doc.querySelector('#minSample').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 0, 'sample size filter should remove smaller samples');
  assert.match(doc.querySelector('.ts-no-results').textContent, /No verified Team Total trends available for this selection/);

  doc.querySelector('#minSample').value = '0';
  doc.querySelector('#minSample').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  changeSelect(doc, '#sortBy', 'sample');
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 1, 'sorting should preserve filtered cards');

  doc.querySelector('[data-source-id]').click();
  assert(!doc.querySelector('#sourceModal').classList.contains('is-hidden'), 'verified source should open supporting data');
  assert.match(doc.querySelector('#sourceModalBody').textContent, /New Orleans Pelicans/);
  assert.match(doc.querySelector('#sourceModalBody').textContent, /Why counted/);

  doc.querySelector('[data-detail-toggle]').click();
  assert(!doc.querySelector('.ts-detail-panel').classList.contains('is-hidden'), 'detail panel should expand');
  assert.match(doc.querySelector('.ts-detail-panel').textContent, /Exact query\/filter/);

  const corruptedData = {
    NBA: {
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
  corruptedDom.window.document.querySelector('#runTrendspotter').click();
  assert.strictEqual(corruptedDom.window.document.querySelectorAll('.ts-result-item').length, 0, 'incomplete trends must not render results');

  console.log('Trendspotter accuracy frontend tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
