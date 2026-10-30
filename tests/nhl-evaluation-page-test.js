'use strict';
/**
 * nhl-evaluation-page-test.js -- NHL program 2026-10-30.
 *  1. /nhl-simulator/ accuracy numbers come from data/nhl-evaluation.json only (stamp --check),
 *     with the 2026-27 live evaluation and the backtest labelled separately, and none of the
 *     old hand-typed claims ("3,939 NHL games across four seasons", 57.6%, 2.15, 1.8%).
 *  2. Starter copy says confirmed-or-projected, never "most starts on its current roster".
 *  3. Matchup pages label the season basis from the model (no meta.stats_season header).
 *  4. Season/playoff bake refuses the restart fallback snapshot and stale inputs.
 *   node tests/nhl-evaluation-page-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'nhl-simulator', 'index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nhl-evaluation.json'), 'utf8'));

execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'stamp-nhl-evaluation.js'), '--check'], { stdio: 'pipe' });

assert.ok(/<h3>2026-27 live evaluation<\/h3>/.test(html), 'live evaluation section');
assert.ok(/<h3>Backtest \(research\)<\/h3>/.test(html), 'backtest section, labelled');
for (const bad of ['3,939 NHL games across four seasons', 'across four seasons', '57.6%', '2.15 goals', 'calibration error was 1.8%',
  'goaltender with the most starts on its current roster', 'always labelled projected because the league does not publish']) {
  assert.ok(!html.includes(bad), 'old claim still on the page: ' + bad);
}
const L = data.live;
assert.ok(html.includes(Number(L.games).toLocaleString('en-US') + ' games'), 'live game count from the data file');
assert.ok(html.includes(Number(L.model_brier).toFixed(4)) && html.includes(Number(L.market_brier).toFixed(4)), 'model and market Brier from the data file');
assert.ok(html.includes(Number(data.backtest.all.games).toLocaleString('en-US') + ' games'), 'backtest count from the data file');
assert.ok(/Opening week[^<]*not backfilled/.test(html), 'opening week gap stated');

const mp = fs.readFileSync(path.join(ROOT, 'scripts', 'build_sim_matchup_pages.js'), 'utf8');
assert.ok(!/esc\(d\.meta\.stats_season\)\} season/.test(mp) && !/\+ d\.meta\.stats_season/.test(mp), 'matchup header no longer prints meta.stats_season');
assert.ok(/nhlBasis\(model\)/.test(mp), 'matchup header from the model season basis');

const { inputsProblem } = require('../scripts/build_league_sim_pages.js');
const now = Date.parse('2026-10-30T14:00:00Z');
assert.ok(/fallback/.test(inputsProblem({ model: { fallback: true, built_at: '2026-08-26T01:41:57Z' } }, now)));
assert.ok(/old/.test(inputsProblem({ model: { fallback: false, built_at: '2026-08-26T01:41:57Z' } }, now)));
assert.strictEqual(inputsProblem({ model: { fallback: false, built_at: '2026-10-30T12:46:20Z' } }, now), null);

process.stdout.write('NHL_EVALUATION_PAGE PASSED\n');
