#!/usr/bin/env node
/* TRENDSPOTTER_LABEL_SPLIT_20260912
   -----------------------------------------------------------------------------
   Two trend sources share the MLB hub and they must never share a label.

     the strict engine   services/mlbTrendEngine, MIN_SAMPLE 20, edge measured
                         against the market's own implied probability for the
                         moneyline, per-market edge thresholds. Its output is
                         the only thing allowed to be called a VERIFIED trend
                         or to claim it cleared a gate.
     the last-10 feed    /api/trendspotter/verified, every row a sample of 10,
                         no baseline, no gate, no edge claim. It is RECENT FORM
                         and is never called a verified trend.

   The 2026-09-12 audit found the hub claiming "150 trends across today's slate
   cleared the sample size and edge gates" above a list of last-10 rows, none of
   which had cleared anything: the engine's floor is 20 games and every one of
   those rows has a sample of 10.

   The real product keeps its name. /trendspotter/ is the query tool and is not
   touched by any of this.

   Run: node tests/trend-label-separation-test.js
*/
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let checks = 0;
const ok = (c, label) => { checks += 1; assert.ok(c, label); };

const hubJs = read('static/js/handicapping-mlb.js');
const gen = read('scripts/build_mlb_matchup_pages.py');
const hubHtml = read('handicapping/mlb/index.html');
const formHtml = read('handicapping/mlb/trends/index.html');
const tsHtml = read('trendspotter/index.html');
const tsJs = read('static/js/trendspotter.js');

/* ---------------------------------------------- 1. the false gate claim ---- */

for (const [name, src] of [['the generator', gen], ['the baked hub page', hubHtml]]) {
  ok(!/trends across today.{0,3}s slate cleared the sample size and edge gates/.test(src),
    name + ': must not claim the last-10 lines cleared a gate');
  ok(!/<h3>Verified MLB trends on today.{0,3}s board<\/h3>/.test(src),
    name + ': the last-10 section is not headed "Verified MLB trends"');
  ok(/Recent form on today.{0,3}s board/.test(src),
    name + ': the last-10 section is headed as recent form');
  ok(/These are counts, not gated trends/.test(src),
    name + ': and says plainly that they are counts');
}

/* The link to the form page must not promise verified trends. */
ok(!/lists every verified trend with its sample/.test(gen + hubHtml),
  'nothing points at the form page as a list of verified trends');
ok(/MLB recent form today<\/a> lists every team/.test(hubHtml),
  'the hub points at it as recent form');

/* ------------------------------------------- 2. the form page own labels --- */

ok(!/Nothing that failed the gate appears here/.test(gen + formHtml),
  'the form page no longer claims a gate it does not apply');
ok(!/Verified, With Samples/.test(gen + formHtml), 'the form page title drops "Verified"');
ok(/MLB Recent Form Today/.test(formHtml), 'the form page title names recent form');
ok(/<h1>MLB recent form today<\/h1>/.test(formHtml), 'and so does its H1');
ok(!/&middot; \d+ trends<\/h3>/.test(formHtml),
  'per-matchup headings do not call last-10 lines trends');
ok(/&middot; \d+ last-10 lines<\/h3>/.test(formHtml), 'they call them last-10 lines');
ok(/These are counts of what happened. They carry no baseline, no sample gate and no edge claim/
  .test(formHtml), 'the section note survives untouched');
/* The URL must not move. A page with impressions is never renamed. */
ok(/href="\/handicapping\/mlb\/trends\/"/.test(hubHtml),
  'the form page keeps its URL and stays linked from the hub');
ok(/<link rel="canonical"[^>]*handicapping\/mlb\/trends\//.test(formHtml),
  'and keeps its canonical');
ok(!/noindex/i.test(formHtml), 'and is still indexable');

/* -------------------------------- 3. what IS allowed to say verified ------ */

/* The strict engine's own surfaces keep the word, because they earn it. */
ok(/verified trends that cleared our sample gate/.test(hubHtml),
  'the matchup pages may still be described as carrying verified trends');
ok(/Verified trends <span class="hh-count">/.test(hubJs),
  'the hub JS still labels the strict engine output as verified');
ok(/cleared the engine/.test(hubJs), 'and still says what cleared it');
ok(/Recent form, last 10 games/.test(hubJs),
  'while the feed rows stay headed as recent form');
ok(/no baseline, no sample gate, no edge claim/.test(hubJs),
  'with the disclaimer intact');
ok(!/the feed has verified trends/.test(hubJs),
  'no comment calls the feed rows verified trends any more');

/* ------------------------------- 4. the overview count must match its list - */

ok(/apiTrendsForOverview/.test(hubJs), 'the overview renders engine rows first');
const ov = hubJs.slice(hubJs.indexOf('hh-tsec--ov'), hubJs.indexOf('hh-tsec--ov') + 900);
ok(!/hh-tsec__list">' \+ reps\.slice\(0, TOP\)/.test(ov),
  'the overview no longer renders only the feed rows under a verified count');
ok(/' verified'/.test(ov), 'the overview still names how many cleared the engine');

/* --------------------------------- 5. the real product is untouched ------- */

ok(/Trend Spotter/.test(tsHtml), 'the tool keeps its name');
ok(/trendspotter\/query/.test(tsJs), 'and still runs on the query engine');
ok(!/trendspotter\/verified/.test(tsJs),
  'and still does not read the legacy feed');
ok(/Define|Pick a matchup/.test(tsHtml), 'and its own flow is intact');

console.log('trend-label-separation-test: %d checks passed', checks);
