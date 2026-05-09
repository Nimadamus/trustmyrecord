#!/usr/bin/env node

const assert = require('assert');

const SITE = 'https://trustmyrecord.com';

async function getText(path) {
  const url = `${SITE}${path}${path.includes('?') ? '&' : '?'}codex_cache_bust=live_protected_${Date.now()}`;
  const response = await fetch(url, { headers: { 'user-agent': 'TrustMyRecord live protected source proof' } });
  assert.strictEqual(response.status, 200, `${path} should return HTTP 200`);
  return response.text();
}

async function main() {
  const [predeploy, profile, sportsbook, polls, handicappers, leaderboards, streaks] = await Promise.all([
    getText('/scripts/predeploy-guard.ps1'),
    getText('/profile/'),
    getText('/sportsbook/'),
    getText('/polls/'),
    getText('/handicappers/'),
    getText('/leaderboards/'),
    getText('/static/js/streaks.js'),
  ]);

  assert(predeploy.includes('tests/workflow-regression-test.js'), 'live predeploy should include workflow guard');
  assert(predeploy.includes('tests/trendspotter-accuracy-test.js'), 'live predeploy should include Trendspotter accuracy guard');
  assert(predeploy.includes('tests/sportsbook-no-game-drop-regression-test.js'), 'live predeploy should include sportsbook no-game-drop guard');
  assert(predeploy.includes('tests/publish-guard-regression-test.js'), 'live predeploy should include publish guard test');

  assert(profile.includes('PROFILE_NO_OLD_THEME_FLASH_20260508'), 'live profile should keep anti-flash marker');
  assert(profile.includes('Pushes are tracked but skipped for W/L streaks.'), 'live profile should describe push-neutral streaks');
  assert(profile.includes('ranking_status'), 'live profile should render backend ranking_status source');

  assert(sportsbook.includes('window.TMR.fetchGamesFromESPN = function(sportKey, callback)'), 'live sportsbook should keep ESPN fallback path');
  assert(sportsbook.includes('sportsbook-production-fix-persist-reliability.js?v=20260509logorestore1&cb=20260509logorestore1'), 'live sportsbook should keep logo-restored reliability script include');
  assert(sportsbook.includes('tmr-redesign-overrides-sportsbook.css?v=20260509logorestore1'), 'live sportsbook should keep logo-restored stylesheet include');
  assert(sportsbook.includes('window.TMR._teamLogo'), 'live sportsbook should keep team-logo renderer');
  assert(sportsbook.includes('SPORTSBOOK_LOGO_VISIBILITY_RESTORE_20260509'), 'live sportsbook should keep final logo visibility restore CSS');

  assert(polls.includes('tmr-polls-panel'), 'live polls should keep premium dark panel source');
  assert(polls.includes('Create Poll'), 'live polls should keep Create Poll entry point');

  assert(handicappers.includes('/users/handicappers/summary?'), 'live handicappers should consume summary endpoint');
  assert(handicappers.includes('Minimum 20 graded picks'), 'live handicappers should show rank threshold copy');
  assert(handicappers.includes('positive net units'), 'live handicappers should show positive-unit eligibility copy');

  assert(leaderboards.includes('sortBy=net_units'), 'live leaderboards should request net-unit ranking');
  assert(leaderboards.includes('20 graded picks'), 'live leaderboards should disclose public rank threshold');
  assert(leaderboards.includes('positive net units'), 'live leaderboards should disclose positive-unit eligibility');

  assert(streaks.includes("if (status === 'push') continue;"), 'live streaks should keep push-neutral current streak behavior');
  assert(streaks.includes('pick && pick.graded_at'), 'live streaks should prefer graded_at ordering');

  console.log('live protected sources test passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
