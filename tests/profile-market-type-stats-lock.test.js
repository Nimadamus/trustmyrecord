#!/usr/bin/env node

// PROFILE_MARKET_TYPE_STATS_LOCK (June 27 2026)
// Locks the profile stat-table fixes so a future edit (including a concurrent
// agent/session committing with the same token) cannot silently revert them.
// Fail-closed: if any guarded marker disappears, the regression lock goes red
// and the change cannot reach main cleanly.
//
// Guards four things on profile/index.html:
//   1. Avg Odds backfill on Performance by Market Type + Sport parent rows,
//      computed from the loaded graded picks (parents render before the ledger
//      loads, so the value must be filled in afterward).
//   2. The expanded breakdown sub-rows use clean CSS hierarchy, NOT the old
//      "u21b3" arrow glyph.
//   3. The 6-7 column split tables are not forced to the wide Public-Ledger
//      min-width (so ROI fits the card / right edge aligns).
//   4. The drilldown side-row hierarchy CSS exists.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'profile/index.html'), 'utf8');

// 1. Avg Odds backfill present (function + both table targets + both callers).
[
  'AVG_ODDS_PARENT_BACKFILL_20260627',
  'function tmrxFillMarketAvgOddsFromPicks',
  "'tmrxTableMarket', 'tmrxTableMarketTop'",
  "'tmrxTableSport', 'tmrxTableSportTop'",
  'data-sport-key=',
].forEach((needle) => {
  assert(html.includes(needle), `profile/index.html must keep Avg Odds backfill marker: ${needle}`);
});

// The backfill must run both after picks load AND from the table-mirror step,
// otherwise the value never appears depending on load order.
const backfillCalls = (html.match(/tmrxFillMarketAvgOddsFromPicks\(\)/g) || []).length;
assert(backfillCalls >= 3, `Avg Odds backfill must be invoked in >=3 places (def + callers); found ${backfillCalls}`);

// 2. The old arrow glyph must NOT be reintroduced into rendered row markup.
// (It is allowed to appear once inside an explanatory CSS comment.)
const glyphCount = (html.match(/↳/g) || []).length;
assert(glyphCount <= 1, `Expanded breakdown must not use the "↳" glyph in row markup (found ${glyphCount} occurrences)`);
assert(
  !/tmrx-drill-side"><td class="name">↳/.test(html),
  'tmrx-drill-side rows must not prefix the label with the "↳" glyph',
);

// 3. Split tables must be released from the wide ledger min-width.
[
  'MARKET_TABLE_FIT_20260627',
  '#tmrxTableMarketTop',
  '#tmrxTableSportTop',
].forEach((needle) => {
  assert(html.includes(needle), `profile/index.html must keep market-table fit CSS: ${needle}`);
});

// 4. Clean side-row hierarchy CSS (indent + accent, not glyph).
assert(html.includes('DRILL_SIDE_HIERARCHY_20260627'), 'profile/index.html must keep clean drill-side hierarchy CSS');
assert(
  /tr\.tmrx-drill-side td\.name::before/.test(html),
  'drill-side rows must use a CSS ::before accent for hierarchy',
);

console.log('[profile-market-type-stats-lock] OK: Avg Odds backfill, clean labels, and table-fit CSS are intact.');
