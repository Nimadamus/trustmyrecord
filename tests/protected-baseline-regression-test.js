#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rules = fs.readFileSync(path.join(root, 'DEVELOPMENT_RULES.md'), 'utf8');
const productSystem = fs.readFileSync(path.join(root, 'TRUSTMYRECORD_PRODUCT_UPGRADE_SYSTEM.md'), 'utf8');
const sportsbook = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const pending = fs.readFileSync(path.join(root, 'my-pending-picks', 'index.html'), 'utf8');
const sitewide = fs.readFileSync(path.join(root, 'static', 'js', 'tmr-sitewide.js'), 'utf8');
const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');
const autoGrader = fs.readFileSync(path.join(root, 'static', 'js', 'auto-grader-fixed.js'), 'utf8');

for (const required of [
  'latest commit on `origin/main`',
  'Do not pin future work to an older hard-coded commit',
  'Protected Baseline and Regression Policy',
  'Risky File Classification Inventory',
  'Standard Completion Checklist',
  'Git diff summary for the patch',
  'Live source, local source, screenshot, or browser proof for any changed protected surface',
  'production protected',
  'reference only',
  'test only',
  'quarantine candidate',
  'temporary artifact',
]) {
  assert(rules.toLowerCase().includes(required.toLowerCase()), `DEVELOPMENT_RULES missing ${required}`);
}

assert(
  !rules.includes('572a29bc38ae4a0aed048752188c8c737a2a4559'),
  'DEVELOPMENT_RULES must not pin protected baseline to the stale May 2026 sportsbook commit'
);

for (const file of [
  'sportsbook/index.html',
  'my-pending-picks/index.html',
  'static/js/tmr-sitewide.js',
  'static/js/navigation.js',
  'static/js/auth-persistent.js',
  'static/js/social-home.js',
  'static/js/feed-ui-overrides.js',
  'static/js/sportsbook-production-fix-persist-reliability.js',
  'static/js/auto-grader-fixed.js',
  'index.html',
  'feed/index.html',
  'forum/index.html',
  'arena/index.html',
  'polls/index.html',
  'leaderboards/index.html',
  'handicappers/index.html',
  'account/index.html',
  'community/index.html',
  'dashboard/index.html',
  'directory/index.html',
  'challenges/index.html',
  'consensus/index.html',
  'polls-trivia/index.html',
  'predictions/index.html',
  'forums/index.html',
  'leaderboard/index.html',
  'make-picks/index.html',
  'cappers/index.html',
  'members/index.html',
  'my-record/index.html',
  'mypicks/index.html',
  'pick/index.html',
  'picks/index.html',
  'promos/index.html',
  'signin/index.html',
]) {
  assert(rules.includes(file), `DEVELOPMENT_RULES must classify ${file}`);
}

for (const required of [
  'Protected Baseline',
  'Product Identity',
  'Design Bible',
  'UX Rubric',
  'Current Audit Summary',
  'Forum Post Pages',
  'Any Leaderboard Pages',
  'Any Capper Ranking Pages',
  'Master Punch List',
  'Phase 1: Regression Lockdown',
  'Phase 2: Shared Design System Cleanup',
  'Phase 3: Page-By-Page Visual Overhaul',
  'Phase 4: QA And Proof',
  'Batch Acceptance Checklist',
  'Pending picks must not be publicly exposed',
  'Do not revert commits',
]) {
  assert(productSystem.includes(required), `TRUSTMYRECORD_PRODUCT_UPGRADE_SYSTEM missing ${required}`);
}

assert(sportsbook.includes('SPORTSBOOK_RIGHT_RAIL_NO_OVERFLOW_FINAL_20260507'), 'sportsbook right rail containment guard must remain');
assert(sportsbook.includes('grid-column: 3 / 4'), 'sportsbook right rail must remain pinned to desktop column 3');
assert(sportsbook.includes('SPORTSBOOK_AUTH_ODDS_POLISH_20260507'), 'sportsbook auth display guard must remain');
assert(sportsbook.includes('tmr-sportsbook-auth-display-sync'), 'sportsbook logged-in auth display sync must remain');
assert(sportsbook.includes('data-tmr-auth="logged-in"'), 'sportsbook must have logged-in CTA hiding CSS');
assert(sportsbook.includes('modeRisk'), 'Risk mode control must remain');
assert(sportsbook.includes('modeToWin'), 'To Win mode control must remain');
assert(!sportsbook.includes('RISK TO WIN'), 'stale RISK TO WIN copy must not return');
assert(!sportsbook.includes('tmr-redesign-test-sportsbook-logos.js'), 'old sportsbook logo enhancer script must not return');
assert(!sportsbook.includes('var LEGACY_TEAM_LOGOS'), 'legacy inline logo map must not return');

assert(reliability.includes('function renderTeamLogo'), 'protected logo renderer must remain');
assert(reliability.includes('window.TMR.renderSportsbookTeamLogo = renderTeamLogo'), 'protected logo renderer exposure must remain');
assert(reliability.includes('lockFunction(window.TMR, \'renderSportsbookTeamLogo\', renderTeamLogo)'), 'logo renderer lock must remain');
assert(reliability.includes('stake_mode: stakeMode'), 'stake mode payload must remain');
assert(reliability.includes('risk_units: stakeValues.risk_units'), 'risk_units payload must remain');
assert(reliability.includes('to_win_units: stakeValues.win_units'), 'to_win_units payload must remain');

assert(autoGrader.includes('function shouldUseBackendGrading()'), 'auto-grader backend skip detector must remain');
assert(autoGrader.includes('if (!scores.completed)'), 'auto-grader must not grade incomplete games');
assert(autoGrader.includes('window.TMR_GRADER = TMR_GRADER'), 'auto-grader global exposure must remain');
assert(autoGrader.includes("['tmr_picks', 'trustmyrecord_picks', 'tmr_picks_legacy']"), 'auto-grader legacy local-pick cleanup keys must remain');
assert(autoGrader.includes('localStorage.removeItem(key)'), 'auto-grader legacy local-pick cleanup must remain');

assert(sitewide.includes('buildLoggedOutActions'), 'sitewide nav must still define guest actions');
assert(sitewide.includes('buildLoggedInActions'), 'sitewide nav must still define logged-in profile actions');
assert(sitewide.includes('Log Out'), 'logged-in nav must still expose Log Out');
assert(sitewide.includes('Join Free') && sitewide.includes('Log In'), 'guest nav CTA labels must remain available for guests');

assert(pending.includes('PENDING_PICK_TOTAL_LINE_NUMERIC_ONLY_20260507'), 'pending numeric-only total line guard must remain');
assert(pending.includes('PENDING_PICK_RENDER_COUNT_FIX_20260507'), 'pending render count guard must remain');
assert(pending.includes('Full Game Total'), 'pending full-game total label must remain');
assert(pending.includes('Team Total'), 'pending team total label must remain');
assert(!/side\s*\?\s*side\s*\+\s*['"]\s['"]\s*\+\s*line/.test(pending), 'pending Line column must not prefix totals with U/O');

console.log('protected baseline regression test passed');
