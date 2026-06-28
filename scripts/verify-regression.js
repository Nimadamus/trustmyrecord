#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const startedAt = new Date();

const allChecks = [
  ['unit/static: line formatting', 'node', ['tests/line-formatting-regression-test.js'], 'static'],
  ['unit/static: pick line single source', 'node', ['tests/pick-line-single-source-test.js'], 'static'],
  ['unit/static: sportsbook visual marker lock', 'node', ['tests/sportsbook-approved-visual-lock.test.js'], 'static'],
  ['unit/static: sportsbook reliability guard', 'node', ['tests/sportsbook-reliability-guard-test.js'], 'static'],
  ['unit/static: sportsbook F5 board layout lock', 'node', ['tests/sportsbook-f5-board-layout-lock-test.js'], 'static'],
  ['unit/static: sportsbook stake mode guard', 'node', ['tests/sportsbook-stake-mode-ui-test.js'], 'static'],
  ['unit/static: sportsbook submit flow guard', 'node', ['tests/sportsbook-submit-flow-guard-test.js'], 'static'],
  ['unit/static: sportsbook no game drop guard', 'node', ['tests/sportsbook-no-game-drop-regression-test.js'], 'static'],
  ['unit/static: sportsbook header guard', 'node', ['tests/sportsbook-header-regression-test.js'], 'static'],
  ['unit/static: sportsbook backend board contract', 'node', ['tests/sportsbook-backend-board-render-contract-test.js'], 'static'],
  ['unit/static: sportsbook market hydration', 'node', ['tests/sportsbook-market-groups-hydration-test.js'], 'static'],
  ['unit/static: sportsbook team totals rendering', 'node', ['tests/sportsbook-team-totals-rendering-regression-test.js'], 'static'],
  ['unit/static: protected sportsbook file drift', 'node', ['tests/protected-file-drift-test.js'], 'static'],
  ['unit/static: critical DOM/content locks', 'node', ['tests/critical-dom-content-lock-test.js'], 'static'],
  ['unit/static: profile market-type stats lock', 'node', ['tests/profile-market-type-stats-lock.test.js'], 'static'],
  ['unit/static: model builder shell', 'node', ['tests/model-builder-shell-test.js'], 'static'],
  ['unit/static: trend spotter guided flow', 'node', ['tests/trendspotter-accuracy-test.js'], 'static'],
  ['live static: sportsbook public loading', 'node', ['tests/sportsbook-public-loading-regression-test.js'], 'static'],
  ['forbidden text scan', 'node', ['scripts/forbidden-text-scan.js'], 'static'],
  ['visual/function: Playwright regression lock', 'npx', ['playwright', 'test', '--config=playwright.regression.config.cjs'], 'playwright'],
  ['live browser: sportsbook proof', 'npx', ['playwright', 'test', '--config=playwright.config.cjs'], 'playwright'],
];

const staticOnly = process.env.TMR_REGRESSION_STATIC_ONLY === '1';
const checks = staticOnly ? allChecks.filter(([, , , type]) => type === 'static') : allChecks;

function resolveCommand(command) {
  if (command === 'node') return process.execPath;
  if (command === 'npx' && process.platform === 'win32') return 'npx.cmd';
  return command;
}

async function runInlineNodeCheck(name, args) {
  const started = Date.now();
  const scriptPath = path.join(root, args[0]);
  const originalExit = process.exit;
  const originalArgv = process.argv;
  let exitCode = 0;
  let failure = null;

  process.argv = [process.execPath, scriptPath, ...args.slice(1)];
  process.exit = (code = 0) => {
    exitCode = Number(code) || 0;
    if (exitCode !== 0) throw new Error(`process.exit(${exitCode})`);
  };

  try {
    delete require.cache[require.resolve(scriptPath)];
    require(scriptPath);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  } catch (error) {
    failure = error;
  } finally {
    process.exit = originalExit;
    process.argv = originalArgv;
  }

  return {
    name,
    command: `node ${args.join(' ')}`,
    status: !failure && exitCode === 0 ? 'passed' : 'failed',
    code: failure ? 1 : exitCode,
    durationMs: Date.now() - started,
    ...(failure ? { error: failure.stack || String(failure) } : {}),
  };
}

function runCheck(name, command, args) {
  const started = Date.now();
  const result = spawnSync(resolveCommand(command), args, {
    cwd: root,
    shell: false,
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

async function main() {
  const results = [];
  for (const [name, command, args] of checks) {
    console.log(`\n[regression] ${name}`);
    const result = command === 'node'
      ? await runInlineNodeCheck(name, args)
      : runCheck(name, command, args);
    if (result.error) console.error(result.error.split(/\r?\n/).slice(-12).join('\n'));
    console.log(`[regression] ${name}: ${result.status}`);
    results.push(result);
  }

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
    mode: staticOnly ? 'static-only' : 'full',
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
  console.log(`- Mode: ${report.mode}`);
  console.log(`- Passed: ${passed}`);
  console.log(`- Failed: ${failed}`);
  console.log(`- Routes checked: ${routesChecked.join(', ')}`);
  console.log(`- Baseline screenshots found: ${baselineFiles.length}`);
  console.log(`- Report: ${path.relative(root, reportPath)}`);
  console.log(`- Deployment allowed: ${report.deployment_allowed ? 'YES' : 'NO'}`);

  if (!report.deployment_allowed) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
