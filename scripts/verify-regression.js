#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const startedAt = new Date();

const checks = [
  ['unit/static: line formatting', 'node', ['tests/line-formatting-regression-test.js']],
  ['unit/static: sportsbook visual marker lock', 'node', ['tests/sportsbook-approved-visual-lock.test.js']],
  ['unit/static: sportsbook reliability guard', 'node', ['tests/sportsbook-reliability-guard-test.js']],
  ['unit/static: sportsbook stake mode guard', 'node', ['tests/sportsbook-stake-mode-ui-test.js']],
  ['unit/static: sportsbook no game drop guard', 'node', ['tests/sportsbook-no-game-drop-regression-test.js']],
  ['unit/static: sportsbook header guard', 'node', ['tests/sportsbook-header-regression-test.js']],
  ['unit/static: sportsbook backend board contract', 'node', ['tests/sportsbook-backend-board-render-contract-test.js']],
  ['unit/static: sportsbook market hydration', 'node', ['tests/sportsbook-market-groups-hydration-test.js']],
  ['unit/static: critical DOM/content locks', 'node', ['tests/critical-dom-content-lock-test.js']],
  ['unit/static: model builder shell', 'node', ['tests/model-builder-shell-test.js']],
  ['unit/static: trend spotter guided flow', 'node', ['tests/trendspotter-accuracy-test.js']],
  ['live static: sportsbook public loading', 'node', ['tests/sportsbook-public-loading-regression-test.js']],
  ['forbidden text scan', 'node', ['scripts/forbidden-text-scan.js']],
  ['visual/function: Playwright regression lock', 'npx', ['playwright', 'test', '--config=playwright.regression.config.cjs']],
  ['live browser: sportsbook proof', 'npx', ['playwright', 'test', '--config=playwright.config.cjs']],
];

function runCheck(name, command, args) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    shell: process.platform === 'win32',
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TMR_REGRESSION_BASE_URL: process.env.TMR_REGRESSION_BASE_URL || 'https://trustmyrecord.com',
      TMR_SPORTSBOOK_URL: process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/',
    },
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (output) console.log(output.split(/\r?\n/).slice(-16).join('\n'));
  if (result.error) {
    return {
      name,
      command: `${command} ${args.join(' ')}`,
      status: 'failed',
      code: 1,
      durationMs: Date.now() - started,
      error: result.error.stack || String(result.error),
    };
  }
  return {
    name,
    command: `${command} ${args.join(' ')}`,
    status: result.status === 0 ? 'passed' : 'failed',
    code: result.status == null ? 1 : result.status,
    durationMs: Date.now() - started,
  };
}

const results = checks.map(([name, command, args]) => {
  console.log(`\n[regression] ${name}`);
  const result = runCheck(name, command, args);
  if (result.error) console.error(result.error.split(/\r?\n/).slice(-12).join('\n'));
  console.log(`[regression] ${name}: ${result.status}`);
  return result;
});

const baselineDir = path.join(root, 'tests', 'visual-baselines');
const baselineFiles = fs.existsSync(baselineDir)
  ? fs.readdirSync(baselineDir).filter((file) => file.endsWith('.png')).sort()
  : [];
const routesChecked = [
  '/',
  '/sportsbook/',
  '/my-pending-picks/',
  '/profile/?user=betlegend',
  '/model-builder/',
  '/trendspotter/',
  '/arena/',
  '/forum/',
  '/login/',
];

const report = {
  started_at: startedAt.toISOString(),
  finished_at: new Date().toISOString(),
  base_url: process.env.TMR_REGRESSION_BASE_URL || 'https://trustmyrecord.com',
  deployed_live_url_checked: process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/',
  routes_checked: routesChecked,
  screenshots_baseline_count: baselineFiles.length,
  screenshots_baselines: baselineFiles,
  checks: results.map(({ stdout, stderr, ...result }) => result),
  deployment_allowed: results.every((result) => result.status === 'passed'),
};

const reportDir = path.join(root, 'artifacts');
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, 'regression-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

const passed = results.filter((result) => result.status === 'passed').length;
const failed = results.length - passed;
console.log('\nRegression report');
console.log(`- Passed: ${passed}`);
console.log(`- Failed: ${failed}`);
console.log(`- Routes checked: ${routesChecked.join(', ')}`);
console.log(`- Baseline screenshots found: ${baselineFiles.length}`);
console.log(`- Report: ${path.relative(root, reportPath)}`);
console.log(`- Deployment allowed: ${report.deployment_allowed ? 'YES' : 'NO'}`);

if (!report.deployment_allowed) process.exit(1);
