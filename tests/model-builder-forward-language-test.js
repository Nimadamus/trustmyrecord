#!/usr/bin/env node
/* MODEL_BUILDER_POLISH_20260912
   -----------------------------------------------------------------------------
   Two locks from the 2026-09-12 readiness audit.

   1. THE DATE PAIR IS NOT A CONDITION. It windows `graded_at`, which picks a
      slice of history, and the forward scanner ignores it by design. It used to
      sit under "Set your conditions. These are what a future wager has to meet
      to qualify", where it qualified nothing, was saved into the model anyway,
      and was not even rendered on the model's card. It now lives in the
      backtest step and never reaches a saved model.

   2. THE PRODUCT IS FORWARD TRACKING. "Backtest" may only appear where it names
      the real, separate historical check. It may not lead the title, the lede,
      or the Tools hub card.

   Run: node tests/model-builder-forward-language-test.js
*/
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'model-builder/index.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'static/js/model-builder-shell.js'), 'utf8');
const tools = fs.readFileSync(path.join(root, 'tools/index.html'), 'utf8');

let checks = 0;
const ok = (c, label) => { checks += 1; assert.ok(c, label); };
const eq = (a, b, label) => { checks += 1; assert.strictEqual(a, b, label); };

/* ---------------------------------------------------- 1. the date pair -------- */

ok(html.includes('MODEL_BUILDER_POLISH_20260912'), 'the page carries the change marker');
ok(shell.includes('MODEL_BUILDER_POLISH_20260912'), 'the shell carries the change marker');

/* The inputs still exist, because the backtest needs them. */
ok(/id="dateFrom"/.test(html), 'the history-from input still exists');
ok(/id="dateTo"/.test(html), 'the history-to input still exists');

/* They must sit AFTER the conditions step and inside the backtest step. A
   string index comparison is crude and it is exactly the thing that regressed,
   so it is worth pinning. */
const condStep = html.indexOf('Set your conditions');
const backtestStep = html.indexOf('Check it against past results');
const dateInput = html.indexOf('id="dateFrom"');
const trackUntil = html.indexOf('id="trackUntil"');
ok(condStep > 0, 'the conditions step is present');
ok(backtestStep > 0, 'the past-results step is present');
ok(dateInput > backtestStep, 'the date pair sits inside the past-results step, not the conditions step');
ok(dateInput < trackUntil, 'and before the tracking-period control, which is the real window');

/* The hint must say so in words, not only by position. */
ok(/narrows the BACKTEST only/.test(html),
  'the date hint states that it narrows the backtest only');
ok(/tracking period is set in step 4/.test(html),
  'and points at the single control that does set the tracking window');

/* Old labels must not come back in the FORWARD builder. The Game Results
   dataset lower down the page keeps its own "Advanced conditions" block and
   its own date pair, and that is correct: it is a study of completed games
   that states "Nothing is tracked forward from here", so a date window there
   really is a condition on the population being studied. */
const picksMode = html.slice(html.indexOf('id="picksMode"'), html.indexOf('id="gamesMode"'));
ok(picksMode.length > 1000, 'the forward builder block was located');
ok(!/<summary>Advanced conditions<\/summary>/.test(picksMode),
  'the forward builder no longer calls its block "Advanced conditions" now the dates left it');
ok(/<summary>More conditions<\/summary>/.test(picksMode),
  'and it is named for what it holds');
ok(!/id="dateFrom"/.test(picksMode.slice(0, picksMode.indexOf('Check it against past results'))),
  'no date input remains above the past-results step');
ok(/Nothing is tracked forward from here/.test(shell),
  'the Game Results dataset still says plainly that it tracks nothing forward');

/* ---- the saved model must not carry the dates ---- */

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let depth = 0;
  const open = src.indexOf('{', start);
  for (let j = open; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced ' + name);
}

const values = {
  modelSport: 'baseball_mlb',
  modelSide: 'favorite',
  modelHomeAway: 'home',
  minOdds: '-250',
  maxOdds: '-150',
  minLine: '',
  maxLine: '',
  selectionContains: 'Yankees',
  dateFrom: '2026-06-01',
  dateTo: '2026-06-30',
};
const box = {
  el: (id) => ({ value: values[id] == null ? '' : values[id] }),
  num: (v) => (v === null || v === undefined || v === '' ? null : Number(v)),
  selectedMarkets: () => ['h2h'],
  console,
};
vm.createContext(box);
vm.runInContext([
  extractFunction(shell, 'filtersFromForm'),
  extractFunction(shell, 'backtestFiltersFromForm'),
  'this.filtersFromForm = filtersFromForm; this.backtestFiltersFromForm = backtestFiltersFromForm;',
].join('\n'), box);

const conditions = box.filtersFromForm();
eq(conditions.date_from, undefined, 'a saved model carries no date_from');
eq(conditions.date_to, undefined, 'a saved model carries no date_to');
eq(conditions.sport_key, 'baseball_mlb', 'and still carries the real conditions');
eq(conditions.side, 'favorite', 'side survives');
eq(conditions.home_away, 'home', 'home/away survives');
eq(conditions.min_odds, -250, 'min odds survives');
eq(conditions.max_odds, -150, 'max odds survives');
eq(conditions.selection_contains, 'Yankees', 'selection text survives');
eq(Object.prototype.hasOwnProperty.call(conditions, 'min_line'), false, 'a blank line bound is omitted');

const forBacktest = box.backtestFiltersFromForm();
eq(forBacktest.date_from, '2026-06-01', 'the backtest still receives date_from');
eq(forBacktest.date_to, '2026-06-30', 'the backtest still receives date_to');
eq(forBacktest.sport_key, conditions.sport_key, 'and the same conditions underneath');

/* The backtest call site must use the backtest builder, and the save path must
   not. This is the wiring that makes the two above mean anything. */
ok(/var filters = backtestFiltersFromForm\(\);[\s\S]{0,200}runBacktest\(filters\)/.test(shell),
  'runBacktest sends the backtest filters');
const startTracking = extractFunction(shell, 'startTracking');
ok(/criteria_json: \{ schema_version: 3, filters: filtersFromForm\(\) \}/.test(startTracking),
  'starting tracking saves the CONDITIONS, without the backtest dates');
ok(!/backtestFiltersFromForm/.test(startTracking),
  'and never the backtest filters');

/* ------------------------------------------------- 2. product language ------- */

const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
ok(title.length > 0, 'the page has a title');
ok(!/backtest/i.test(title), 'the title does not lead on backtesting: ' + title);
ok(/track/i.test(title), 'the title names forward tracking: ' + title);

const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
ok(desc.length > 0, 'the page has a description');
ok(!/backtest/i.test(desc), 'the description does not mention backtesting');

const lede = (html.match(/<p class="lede">([^<]*)</) || [])[1] || '';
ok(!/backtest|historical/i.test(lede), 'the lede does not lead on history: ' + lede);
ok(/track/i.test(lede), 'the lede names tracking');

/* The Tools hub is where a prospective subscriber meets the product first. */
const cardIdx = tools.indexOf('/model-builder/');
ok(cardIdx > 0, 'the Tools hub still links the Model Builder');
const cardCopy = tools.slice(Math.max(0, cardIdx - 1200), cardIdx + 200);
ok(!/backtest/i.test(cardCopy), 'the Tools hub card does not describe it as a backtester');
ok(/track/i.test(cardCopy), 'the Tools hub card says it tracks forward');

/* "Backtest" survives ONLY where it names the separate historical check.
   Nothing on this page may call the PRODUCT a backtester. */
for (const banned of [
  'Backtest Betting Models',
  'Run historical backtest',
  'Your backtest will appear here',
  'Backtest it first',
  'Backtest these conditions',
]) {
  ok(!html.includes(banned) && !shell.includes(banned),
    'the old backtest-first wording is gone: ' + banned);
}

/* And the forward record must still be described as what it is. */
ok(/Nobody enters these/.test(shell),
  'the forward panel still explains that nobody enters the positions');
ok(/never count toward/.test(html) || /never counts toward/.test(html),
  'the page still says past results never count toward the model record');

console.log('model-builder-forward-language-test: %d checks passed', checks);
