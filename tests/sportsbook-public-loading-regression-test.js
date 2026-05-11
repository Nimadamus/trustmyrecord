#!/usr/bin/env node

const assert = require('assert');
const https = require('https');

const LIVE_PAGE = 'https://trustmyrecord.com/sportsbook/';
const LIVE_NBA_API = 'https://trustmyrecord-api.onrender.com/api/games/board/basketball_nba?limit=80';
const LIVE_BUNDLE = 'https://trustmyrecord.com/static/js/sportsbook-production-fix-persist-reliability.js?v=20260511headgrid1';

function get(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'Cache-Control': 'no-cache',
        'User-Agent': 'tmr-sportsbook-public-loading-regression',
      },
      rejectUnauthorized: false,
      timeout: 20000,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Timed out fetching ${url}`));
    });
    request.on('error', reject);
  });
}

(async () => {
  const [page, api, bundle] = await Promise.all([get(LIVE_PAGE), get(LIVE_NBA_API), get(LIVE_BUNDLE)]);

  assert.strictEqual(page.status, 200, 'public sportsbook page must be reachable');
  assert.strictEqual(api.status, 200, 'NBA board API must be reachable');
  assert.strictEqual(bundle.status, 200, 'public sportsbook reliability bundle must be reachable');

  const payload = JSON.parse(api.body);
  const nbaGames = Array.isArray(payload.games) ? payload.games : [];
  assert(nbaGames.length > 0, 'test requires the NBA API to have games');

  assert(
    /sportsbook-production-fix-persist-reliability\.js\?v=20260511headgrid1&cb=20260511headgrid1/.test(page.body),
    'public page must load the current sportsbook reliability bundle/cache key'
  );
  assert(
    !page.body.includes("onclick=\"window.__tmrSelectSportBoard && window.__tmrSelectSportBoard('NBA')\""),
    'public route guard must not contain the unescaped inline NBA retry handler that breaks the boot script'
  );
  assert(
    bundle.body.includes('public_default_board_failed') &&
      bundle.body.includes('window.__tmrSportsbookPublicLoaded = true') &&
      !bundle.body.includes('ensurePicksAccess().then(function(allowed) {\n                        if (!allowed) return;\n                        if (typeof window.showSection'),
    'public bundle must boot the default board itself and sport tab switching must not require login'
  );

  console.log(`sportsbook public loading regression passed with ${nbaGames.length} NBA API games`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
