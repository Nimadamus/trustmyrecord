#!/usr/bin/env node
// MLB_PHASE_COPY_20261105 + FINAL_TABLE_LABELS_20261105 + MLB_ACCURACY_REPORT_20261105.
// What the MLB pages say has to match the season state and a saved report. Fails on the
// pages as they stood on 11/05: 56.2% on two pages, one column name meaning two things,
// "every game left" on a finished season, a closed page answering "Yes" to submitting.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const state = JSON.parse(read('data/mlb-season-state.json'));
const complete = state.phase === 'complete';

// 1. the retired accuracy claim is gone, visible text and structured data alike.
for (const p of ['mlb-simulator/index.html', 'methodology/index.html']) {
  const html = read(p);
  assert.ok(!/56\.2/.test(html), p + ' still carries 56.2');
  assert.ok(!/2,434/.test(html), p + ' still carries 2,434');
  assert.ok(!/0\.244\b/.test(html), p + ' still carries Brier 0.244');
}

// 2. every published accuracy figure equals the saved report.
const report = JSON.parse(read('data/mlb-sim-accuracy.json'));
const stamp = require(path.join(root, 'scripts', 'stamp-mlb-accuracy.js'));
assert.deepStrictEqual(stamp.run(true), [], 'accuracy copy drifted from data/mlb-sim-accuracy.json: run scripts/stamp-mlb-accuracy.js');
assert.ok(report.source && report.source.engineSha256, 'report names the engine it scored');
assert.ok((report.holdout || report.tuned).n >= 500, 'scored sample');
assert.ok(!/<!--MLB_ACCURACY:[a-z-]+--><!--\/MLB_ACCURACY-->/.test(read('mlb-simulator/index.html') + read('methodology/index.html')), 'an accuracy marker is empty');

if (complete) {
  // 3. one word, one meaning on the final odds page.
  const odds = read('mlb-playoff-odds/index.html');
  assert.ok(!/<th[^>]*>World Series<\/th>/.test(odds), 'bare World Series column on the final page');
  assert.ok(/Reached World Series/.test(odds) && /Won World Series/.test(odds));
  assert.ok(!/80% range/.test(odds), 'range column on a finished season');

  // 4. nothing promises games, odds or a builder that no longer exist.
  const team = text(read('mlb-simulator/teams/new-york-yankees/index.html'));
  assert.ok(!/every game left|each remaining game|All 30 teams, live/.test(team), 'team page in season wording');
  const hub = text(read('mlb-simulator/index.html'));
  assert.ok(!/Every club.s live playoff odds/.test(hub), 'hub in season wording');
  const season = read('mlb-season-simulator/index.html');
  assert.ok(!/The builder above is live/.test(text(season)));
  assert.ok(!/"name":"Can I submit MLB season predictions on this page\?","acceptedAnswer":\{"@type":"Answer","text":"Yes/.test(season), 'JSON-LD still says Yes');
  const playoff = text(read('mlb-playoff-simulator/index.html'));
  assert.ok(!/bracket is set|fixed today|reruns as results/.test(playoff));
}

// 5. the wording goes back by itself when a season opens.
const B = require(path.join(root, 'scripts', 'build_mlb_season_pages.js'));
const marked = '<!--MK:mlbPhase:po-set-->x<!--/MK:mlbPhase-->';
assert.ok(B.applyPhaseCopy(marked, { phase: 'regular', season: 2027 }).includes('and the twelve team bracket is set.'));
assert.ok(B.applyPhaseCopy(marked, Object.assign({}, state, { phase: 'complete' })).includes('twelve teams made the bracket'));

// 6. the plate appearance engine is not described as pitch by pitch in the builder.
assert.ok(!/pitch by pitch/.test(read('scripts/build_mlb_odds_page.js')));

// 7. the big score is labelled as one game.
assert.ok(/one simulated game/i.test(read('mlb-simulator/index.html')));

console.log('mlb-copy-truth-test ok');
