const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..', '_live-current');
const html = fs.readFileSync(path.join(root, 'trendspotter', 'index.html'), 'utf8')
  .replace(/<script src="\/static\/js\/config\.js[^>]*><\/script>/, '')
  .replace(/<script src="\/static\/js\/trendspotter\.js[^>]*><\/script>/, '');
const js = fs.readFileSync(path.join(root, 'static', 'js', 'trendspotter.js'), 'utf8');

function makeTrend(overrides = {}) {
  return {
    rank: 1,
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
    date_range: '2024-03-05 to 2026-04-05',
    source_url: 'https://www.espn.com/nba/team/schedule/_/name/orl',
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

async function selectSportAndFirstMatchup(dom, sport = 'NBA') {
  const doc = dom.window.document;
  doc.querySelector(`[data-sport="${sport}"]`).click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const matchup = doc.querySelector('[data-matchup]');
  if (matchup) {
    matchup.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

(async () => {
  const validData = {
    NBA: { status: 'fresh', trends: [makeTrend()] },
  };
  const validDom = await bootWithData(validData);
  await selectSportAndFirstMatchup(validDom);
  let doc = validDom.window.document;
  assert.strictEqual(doc.querySelectorAll('[data-matchup]').length, 1, 'valid trend should create one matchup option');
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 1, 'valid trend should render one result');
  assert.match(doc.querySelector('.ts-claim').textContent, /Magic have scored OVER 103\.5/);
  assert.strictEqual(doc.querySelector('.ts-source').getAttribute('href'), validData.NBA.trends[0].source_url);

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
  await selectSportAndFirstMatchup(corruptedDom);
  doc = corruptedDom.window.document;
  assert.strictEqual(doc.querySelectorAll('[data-matchup]').length, 0, 'incomplete trends must not create matchup options');
  assert.match(doc.querySelector('#matchupEmpty').textContent, /No verified matchups available yet/);
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 0, 'incomplete trends must not render results');

  const noResultDom = await bootWithData(validData);
  await selectSportAndFirstMatchup(noResultDom);
  doc = noResultDom.window.document;
  doc.querySelector('[data-matchup]').setAttribute('data-matchup', 'Ghost @ Phantom');
  doc.querySelector('[data-matchup]').click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(doc.querySelectorAll('.ts-result-item').length, 0, 'unknown matchup must not render trends');
  assert.strictEqual(doc.querySelector('.ts-no-results').textContent, 'No verified trends available yet for this matchup.');

  console.log('Trendspotter accuracy frontend tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
