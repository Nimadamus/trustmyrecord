/* MLB_CONFIDENCE_FROM_PROBABILITY_20261030 + MLB_DOME_WEATHER_20261030
 *
 * 1. The confidence label is a function of the shown win probability only:
 *    >= 64% Strong lean, >= 56% Moderate lean, otherwise Tight matchup. The old
 *    label also fired on a rating gap, so a near coin flip could read "Strong lean".
 * 2. A chosen rain condition never produces a rain delay or a wet field under a
 *    roof (Tropicana Field), and still does in an open air park (control).
 *
 * Run: node tests/mlb-simulator-confidence-dome-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js'), 'utf8');
function loadSimulator() {
  const el = () => ({
    id: '', disabled: false, value: '', textContent: '', innerHTML: '', className: '', attributes: {}, listeners: {},
    style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, removeChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  });
  const ctx = {
    window: { URL: { createObjectURL() { return 'blob:t'; }, revokeObjectURL() {} } },
    document: { readyState: 'complete', getElementById() { return el(); }, querySelector() { return el(); },
      querySelectorAll() { return []; }, addEventListener() {}, createElement() { return el(); },
      body: { appendChild() {}, removeChild() {} } },
    console: { info() {}, log() {}, warn() {}, error() {} },
    Math, Number, Date, Promise, JSON, String, Array, Object, isNaN, parseFloat, parseInt, setTimeout, clearTimeout,
    Blob: class {}, navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    fetch: () => Promise.reject(new Error('offline test')), CONFIG: { api: { baseUrl: '' } },
  };
  ctx.window.document = ctx.document;
  vm.runInNewContext(source, ctx);
  return ctx.window.TMRMlbSimulator;
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); } };
const expected = (p) => (p >= 0.64 ? 'Strong lean' : p >= 0.56 ? 'Moderate lean' : 'Tight matchup');

const A = loadSimulator();
const cur = A.localTeams.current;
const by = (abbr) => cur.find((t) => t.abbreviation === abbr);

/* 1. Confidence: the most lopsided and the closest pairings, both home/away. */
const sorted = cur.slice().sort((a, b) => (a.offense + a.startingPitching + a.bullpen) - (b.offense + b.startingPitching + b.bullpen));
const pairs = [];
for (let i = 0; i < 6; i++) { pairs.push([sorted[i], sorted[sorted.length - 1 - i]], [sorted[sorted.length - 1 - i], sorted[i]]); }
for (let i = 10; i < 16; i++) pairs.push([sorted[i], sorted[i + 1]]);
let wrong = [];
let gapCases = 0;
for (const [a, h] of pairs) {
  const r = A.simulate(a, h, {}, 'conf-' + a.abbreviation + h.abbreviation, false, null);
  if (r.strengthGap >= 5 && r.winnerPct < 0.64) gapCases++;
  if (r.confidence !== expected(r.winnerPct) || r.confidenceBand !== r.confidence) wrong.push(`${a.abbreviation}@${h.abbreviation} ${r.winnerPct.toFixed(3)} gap ${Number(r.strengthGap).toFixed(1)} -> ${r.confidence}`);
}
ok(`confidence label follows the shown win probability on ${pairs.length} pairings`, !wrong.length, wrong.slice(0, 4).join('; '));
console.log(`      (${gapCases} of them have a rating gap of 5+ with a win probability under 64%, where the old rule disagreed)`);

/* 1b. The label function itself: a near coin flip with a big rating gap is a
   tight matchup (the old rule called it a strong lean). */
const fnSrc = (source.match(/function confidenceLabel\([^)]*\) \{[\s\S]*?\r?\n    \}/) || [])[0];
const confidenceLabel = fnSrc && vm.runInNewContext('(' + fnSrc + ')');
ok('confidenceLabel(0.52, rating gap 12) is "Tight matchup"', confidenceLabel && confidenceLabel(0.52, 12) === 'Tight matchup', confidenceLabel && confidenceLabel(0.52, 12));
ok('confidenceLabel(0.60, rating gap 12) is "Moderate lean"', confidenceLabel && confidenceLabel(0.60, 12) === 'Moderate lean');
ok('confidenceLabel(0.66) is "Strong lean"', confidenceLabel && confidenceLabel(0.66) === 'Strong lean');

/* 2. Rain under a roof. */
const N = 30;
const delays = (away, home) => {
  let n = 0, wet = 0;
  for (let i = 0; i < N; i++) {
    const r = A.simulate(away, home, {}, 'rain-' + i, false, 'heavy-rain');
    const g = r.boxScore || {};
    if (g.weatherDelay || g.pregameDelay) n++;
    if (g.simWeather && g.simWeather.key !== 'clear') wet++;
  }
  return { n, wet };
};
const dome = delays(by('NYY'), by('TB'));
const open = delays(by('TB'), by('NYY'));
ok('heavy rain at Tropicana Field (fixed dome): no rain delay in ' + N + ' games', dome.n === 0, dome.n + ' delays');
ok('heavy rain at Tropicana Field: the game is played as clear', dome.wet === 0, dome.wet + ' games kept rain');
ok('control: heavy rain at Yankee Stadium still produces delays', open.n > 0, 'no delays, the test cannot see delays');
const r = A.simulate(by('NYY'), by('TB'), {}, 'note', false, 'heavy-rain');
ok('the result says why the weather did not apply', (r.liveFactors || []).some((f) => /^Roof: .*fixed dome/.test(f)));
const rr = A.simulate(by('NYY'), by('MIL'), {}, 'note', false, 'light-rain');
ok('retractable roof (Milwaukee) also closes for rain', (rr.liveFactors || []).some((f) => /retractable roof/.test(f)) && !(rr.boxScore && (rr.boxScore.weatherDelay || rr.boxScore.pregameDelay)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
