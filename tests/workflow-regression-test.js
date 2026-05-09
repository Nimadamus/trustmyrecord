#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'sportsbook-regression.yml'), 'utf8');
const referencedTests = [
  'publish-guard-regression-test.js',
  'pending-picks-regression-test.js',
  'trendspotter-accuracy-test.js',
  'homepage-canonical-regression-test.js',
  'stats-engine-regression-test.js',
  'streaks-test.js',
  'streaks-regression-test.js',
  'sportsbook-no-game-drop-regression-test.js',
  'sportsbook-reliability-guard-test.js',
  'auto-grader-regression-test.js',
  'profile-no-old-theme-flash-test.js',
  'profile-source-regression-test.js',
  'public-ranking-ui-live-test.js',
  'live-protected-sources-test.js',
];

for (const testFile of referencedTests) {
  assert(fs.existsSync(path.join(root, 'tests', testFile)), `workflow-referenced test file is missing: ${testFile}`);
}

for (const required of [
  'name: Sportsbook Regression Guards',
  'push:',
  'pull_request:',
  'workflow_dispatch:',
  'line-formatting-guard:',
  'sportsbook-guards:',
  'profile-and-simulator-guards:',
  'live-public-ranking-proof:',
  'live-protected-sources-proof:',
  "if: github.event_name == 'workflow_dispatch'",
  'node tests/publish-guard-regression-test.js',
  'node tests/pending-picks-regression-test.js',
  'node tests/trendspotter-accuracy-test.js',
  'node tests/homepage-canonical-regression-test.js',
  'npm install --no-save jsdom@24.1.3',
  'node tests/stats-engine-regression-test.js',
  'node tests/streaks-test.js',
  'node tests/streaks-regression-test.js',
  'node tests/sportsbook-no-game-drop-regression-test.js',
  'node tests/sportsbook-reliability-guard-test.js',
  'node tests/auto-grader-regression-test.js',
  'node tests/profile-no-old-theme-flash-test.js',
  'node tests/profile-source-regression-test.js',
  './scripts/predeploy-guard.ps1 -SkipRemoteCheck',
  'node tests/public-ranking-ui-live-test.js',
  'node tests/live-protected-sources-test.js',
]) {
  assert(workflow.includes(required), `workflow guard missing: ${required}`);
}

const liveJobIndex = workflow.indexOf('live-public-ranking-proof:');
const dispatchGuardIndex = workflow.indexOf("if: github.event_name == 'workflow_dispatch'", liveJobIndex);
const liveTestIndex = workflow.indexOf('node tests/public-ranking-ui-live-test.js', liveJobIndex);
assert(liveJobIndex >= 0 && dispatchGuardIndex > liveJobIndex, 'live ranking proof must be workflow_dispatch-only');
assert(liveTestIndex > dispatchGuardIndex, 'live ranking test must remain inside the manual proof job');

const liveSourcesJobIndex = workflow.indexOf('live-protected-sources-proof:');
const liveSourcesDispatchGuardIndex = workflow.indexOf("if: github.event_name == 'workflow_dispatch'", liveSourcesJobIndex);
const liveSourcesTestIndex = workflow.indexOf('node tests/live-protected-sources-test.js', liveSourcesJobIndex);
assert(liveSourcesJobIndex >= 0 && liveSourcesDispatchGuardIndex > liveSourcesJobIndex, 'live protected sources proof must be workflow_dispatch-only');
assert(liveSourcesTestIndex > liveSourcesDispatchGuardIndex, 'live protected sources test must remain inside the manual proof job');

const trendInstallIndex = workflow.indexOf('npm install --no-save jsdom@24.1.3');
const trendAccuracyIndex = workflow.indexOf('node tests/trendspotter-accuracy-test.js');
assert(trendInstallIndex >= 0 && trendInstallIndex < trendAccuracyIndex, 'jsdom must install before the standalone Trendspotter accuracy guard');

console.log('workflow regression test passed');
