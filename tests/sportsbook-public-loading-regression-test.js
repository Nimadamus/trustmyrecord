#!/usr/bin/env node

const assert = require('assert');
const https = require('https');

const LIVE_PAGE = 'https://trustmyrecord.com/sportsbook/';
const LIVE_NBA_API = 'https://trustmyrecord-api.onrender.com/api/games/board/basketball_nba?limit=80';

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
  const [page, api] = await Promise.all([get(LIVE_PAGE), get(LIVE_NBA_API)]);

  assert.strictEqual(page.status, 200, 'public sportsbook page must be reachable');
  assert.strictEqual(api.status, 200, 'NBA board API must be reachable');

  const payload = JSON.parse(api.body);
  const nbaGames = Array.isArray(payload.games) ? payload.games : [];
  assert(nbaGames.length > 0, 'test requires the NBA API to have games');

  assert(
    /sportsbook-production-fix-persist-reliability\.js\?v=20260511publicroute1&cb=20260511publicroute1/.test(page.body),
    'public page must load the current sportsbook reliability bundle/cache key'
  );
  assert(
    page.body.includes('board loading guard replaced frozen spinner') &&
      page.body.includes("cache: 'no-store'") &&
      page.body.includes('AbortController'),
    'public page must include the lobby-board timeout guard so NBA cannot remain stuck on Loading live odds while the API has games'
  );


  assert(
    page.body.includes('data-sportsbook-tab="sport" data-sport="NBA"') &&
      page.body.includes('data-sportsbook-tab="sport" data-sport="NHL"') &&
      page.body.includes('data-sportsbook-tab="sport" data-sport="MLB"') &&
      page.body.includes('data-sportsbook-tab="sport" data-sport="NFL"') &&
      page.body.includes('data-sportsbook-tab="sport" data-sport="NCAAB"') &&
      page.body.includes('data-sportsbook-tab="sport" data-sport="NCAAF"') &&
      page.body.includes('data-sportsbook-tab="sport" data-sport="Soccer"'),
    'public page must expose guest sport board buttons'
  );

  console.log(`sportsbook public loading regression passed with ${nbaGames.length} NBA API games`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
