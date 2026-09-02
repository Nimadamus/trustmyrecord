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
  const [predeploy, profile, sportsbook, sportsbookCss, sportsbookReliability, polls, handicappers, leaderboards, streaks] = await Promise.all([
    getText('/scripts/predeploy-guard.ps1'),
    getText('/profile/'),
    getText('/sportsbook/'),
    getText('/static/css/tmr-redesign-overrides-sportsbook.css'),
    getText('/static/js/sportsbook-production-fix-persist-reliability.js'),
    getText('/polls/'),
    getText('/handicappers/'),
    getText('/leaderboards/'),
    getText('/static/js/streaks.js'),
  ]);

  assert(predeploy.includes('tests/workflow-regression-test.js'), 'live predeploy should include workflow guard');
  assert(predeploy.includes('tests/trendspotter-accuracy-test.js'), 'live predeploy should include Trendspotter accuracy guard');
  assert(predeploy.includes('tests/sportsbook-no-game-drop-regression-test.js'), 'live predeploy should include sportsbook no-game-drop guard');
  assert(predeploy.includes('tests/publish-guard-regression-test.js'), 'live predeploy should include publish guard test');

  // PROFILE_NO_OLD_THEME_FLASH_20260508 left with the TMRX profile rewrite (the local guard is stale-quarantined for the same reason).
  assert(profile.includes("Pushes don't break a streak."), 'live profile should describe push-neutral streaks');
  assert(profile.includes('ranking_status'), 'live profile should render backend ranking_status source');

  assert(sportsbook.includes('window.TMR.fetchGamesFromESPN = function(sportKey, callback)'), 'live sportsbook should keep ESPN fallback path');
  assert(sportsbook.includes('sportsbook-production-fix-persist-reliability.js?v='), 'live sportsbook should keep the persist-reliability include (hash re-pinned per build)');
  assert(sportsbook.includes('tmr-redesign-overrides-sportsbook.css?v='), 'live sportsbook should keep the overrides stylesheet include (hash re-pinned per build)');
  assert(sportsbook.includes('window.TMR._teamLogo'), 'live sportsbook should keep team-logo renderer');
  assert(sportsbookCss.includes('.sb-team-tag .tmr-team-logo'), 'live sportsbook CSS should style the injected team logo (the May 9 visibility-restore block is gone)');
  assert(sportsbookCss.includes('object-fit: contain !important'), 'live sportsbook CSS should keep logos contained');
  assert(sportsbookCss.includes('display: block !important'), 'live sportsbook CSS should force logo images to render');
  assert(sportsbookCss.includes('.sb-team-tag'), 'live sportsbook CSS should keep the logo holder rule');
  assert(sportsbookReliability.includes('data-tmr-logo-src'), 'live sportsbook reliability JS should expose resolved logo sources');
  assert(sportsbookReliability.includes('loading="eager"'), 'live sportsbook reliability JS should eagerly load logo images');
  assert(sportsbookReliability.includes('referrerpolicy="no-referrer"'), 'live sportsbook reliability JS should keep ESPN logo referrer policy');

  assert(polls.includes('data-league="MLB"'), 'live polls should keep the American-sports league chips');
  assert(polls.includes('Create Poll'), 'live polls should keep Create Poll entry point');

  assert(handicappers.includes('/api/users/directory'), 'live handicappers should consume the directory endpoint');
  assert(handicappers.includes('25+ graded picks'), 'live handicappers should show the graded-picks threshold copy');
  // NET_UNITS_FILTER_20260817: positive-unit eligibility no longer exists.

  assert(leaderboards.includes('sortBy=net_units'), 'live leaderboards should request net-unit ranking');
  assert(leaderboards.includes('20 graded picks'), 'live leaderboards should disclose public rank threshold');
  assert(!leaderboards.includes('positive net units'), 'live leaderboards must not reintroduce the deleted positive-unit gate copy');

  assert(streaks.includes("if (status === 'push' || status === 'pushed') continue;"), 'live streaks should keep push-neutral current streak behavior');
  assert(streaks.includes('pick && pick.graded_at'), 'live streaks should prefer graded_at ordering');

  console.log('live protected sources test passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
