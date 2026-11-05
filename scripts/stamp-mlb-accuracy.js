#!/usr/bin/env node
'use strict';
/* =============================================================================
   stamp-mlb-accuracy.js                              MLB_ACCURACY_REPORT_20261105
   Every published MLB simulator accuracy figure comes from data/mlb-sim-accuracy.json,
   the saved report of a point in time replay through the live engine (see "source" in
   that file for the engine hash and the evidence path). The old panel said 56.2% on
   2,434 games: that row belongs to a separate team strength model, not the simulator.

     node scripts/stamp-mlb-accuracy.js           write
     node scripts/stamp-mlb-accuracy.js --check   exit 1 if a page drifted

   Copy lives between <!--MLB_ACCURACY:key--> and <!--/MLB_ACCURACY--> markers.
   tests/mlb-copy-truth-test.js fails on drift. No dashes: this is published writing.
   ============================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const R = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mlb-sim-accuracy.json'), 'utf8'));
const n = (x) => Number(x).toLocaleString('en-US');
const pct = (x) => Number(x).toFixed(1) + '%';
const b3 = (x) => Number(x).toFixed(3);

// Until a season the settings were not chosen on has been replayed, the page says so and
// reports the season it does have.
const T = R.tuned; const H = R.holdout || T; const M = R.market;
const SCOPE = R.holdout
  ? `on a season its latest settings were not chosen on`
  : `the season its latest settings were chosen on, so read it as an upper bound`;
const SECOND = R.holdout
  ? ` On ${T.season}, the season those settings were chosen on, it scored ${pct(T.accuracyPct)} and ${b3(T.brier)} on ${n(T.n)} games.`
  : '';

const COPY = {
  'hub-lead': `We hold this to the same standard as the picks we track: real, measured results, not marketing. This is a realistic plate appearance simulation, not a crystal ball. We replayed the live engine through all ${n(H.n)} games of the ${H.season} regular season, each game using only what was known before first pitch, ${SCOPE}. It called the winner <strong>${pct(H.accuracyPct)} of the time</strong> against ${pct(H.homeRatePct)} for always picking the home team, with a Brier score of ${b3(H.brier)} against ${b3(H.baselineBrier)} for a flat home team forecast.${SECOND} That is better than a coin flip and useful as research, but it is <strong>not a guaranteed betting edge</strong>: on the ${n(M.n)} games of ${M.season} with a stored pregame price, the market scored ${b3(M.market)} and the simulator ${b3(M.model)}, and a lower score is better.`,
  'hub-winner': `${pct(H.accuracyPct)} on the ${n(H.n)} games of the ${H.season} regular season (home team alone: ${pct(H.homeRatePct)})`,
  'hub-brier': `Brier ${b3(H.brier)} vs ${b3(H.baselineBrier)} for the home team baseline; calibration slope ${Number(H.slope).toFixed(2)} (1.00 is perfect)`,
  'hub-version': `Replayed ${R.replayedOn} on the live engine with real lineups and announced starters. A backtest, not a record of live picks.`,
  'hub-market': `Behind the market on ${n(M.n)} priced games of ${M.season}: ${b3(M.model)} vs ${b3(M.market)}`,
  'hub-seo': `Replayed through all ${n(H.n)} games of ${H.season} the model called winners ${pct(H.accuracyPct)} of the time against ${pct(H.homeRatePct)} for the home team`,
  'method-set': `${n(H.n)} games of ${H.season}, replayed with only pregame information${R.holdout ? '' : ', the season its settings were chosen on'}`,
  'method-model': `${pct(H.accuracyPct)}, Brier ${b3(H.brier)}`,
  'method-home': `${pct(H.homeRatePct)}, Brier ${b3(H.baselineBrier)}`,
  'method-market': `The MLB engine has now been compared with pregame market prices on ${n(M.n)} games of ${M.season}, and the market was more accurate (Brier ${b3(M.market)} against ${b3(M.model)}). The other engines have not been compared, so none of these numbers is evidence of a betting edge.`,
};
const PAGES = ['mlb-simulator/index.html', 'methodology/index.html'];
const RE = /(<!--MLB_ACCURACY:([a-z-]+)-->)[\s\S]*?(<!--\/MLB_ACCURACY-->)/g;

function stamp(html, file) {
  return html.replace(RE, (all, open, key, close) => {
    if (!(key in COPY)) throw new Error(file + ': unknown accuracy key ' + key);
    return open + COPY[key] + close;
  });
}
function run(check) {
  const drift = [];
  for (const f of PAGES) {
    const p = path.join(ROOT, f); const before = fs.readFileSync(p, 'utf8'); const after = stamp(before, f);
    if (before.search(RE) === -1) drift.push(f + ': no markers');
    if (after !== before) { drift.push(f); if (!check) fs.writeFileSync(p, after); }
  }
  return drift;
}
module.exports = { run, COPY };
if (require.main === module) {
  const check = process.argv.includes('--check');
  const d = run(check);
  if (check && d.length) { console.error('DRIFT ' + d.join(', ')); process.exit(1); }
  console.log(check ? 'mlb accuracy copy in sync' : 'stamped ' + (d.join(', ') || 'nothing'));
}
