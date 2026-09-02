#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'leaderboards', 'index.html'), 'utf8');

for (const required of [
  'LEADERBOARDS_PREMIUM_DARK_UI_20260508',
  '<link rel="canonical" href="https://trustmyrecord.com/leaderboards/">',
  // Migrated off the tmr-sitewide bundle to the canonical design-system nav
  // shell in the 2026-07-29 nav+stats consolidation. Same guarantee: the page
  // must not lose its shared nav/session bundle.
  '/static/js/tmr-ds-nav',
  '/static/js/tmr-session',
  // LEADERBOARD_SPORT_FILTER_20260823. Three tokens were retired here and are
  // asserted ABSENT further down instead, because each one pinned a statement
  // the product had already stopped honouring:
  //
  //   'sortBy=net_units'  the board's sort is now the member's choice, mapped
  //                       through SORT_TO_API and sent to the API. A literal
  //                       default in the fetch call is what this replaces.
  //   'positive net units' copy describing a `net_units > 0` eligibility gate
  //                       the API deleted on 2026-08-17 (NET_UNITS_FILTER_
  //                       20260817). The board has listed losing records ever
  //                       since; the empty state still told members it did not.
  //   '5 graded picks'    a hardcoded threshold in copy, while the control
  //                       beside it offers 5 / 10 / 20 / 25 / 50 / 100 / 250.
  //                       The number is read from the live filter now.
  "units: 'net_units'",
  'data-tab="handicappers"',
  'data-tab="trivia"',
  'data-tab="polls"',
  'data-tab="online"',
  'data-tab="h2h"',
  'id="leaderboardBody"',
  'id="capperSearch"',
  'id="sportFilter"',
  'id="sortFilter"',
  'id="sampleFilter"',
  'function emptyStateHtml(opts)',
  'function setStateAsEmpty(stateEl, html)',
  'window.api.getLeaderboard',
  'href="/arena/?challenge=new"',

  // ---- LEADERBOARD_SPORT_FILTER_20260823 -----------------------------------
  // The board's scope is the SERVER's. Selecting MLB used to compare a
  // per-row `sport` field the leaderboard API has never returned against the
  // dropdown value, so every sport rendered an empty board while the hero
  // still counted 46 records. These four tokens are what makes the scope a
  // query instead of a browser-side guess.
  'sport: (filters.sport',
  'minPicks: filters.minPicks',
  'getLeaderboardSports',
  // Two rapid filter changes are two in-flight requests. The later selection
  // must win regardless of which response lands first.
  'boardRequestSeq',
  // An empty board has six causes and they are not the same message. This is
  // what keeps "no ranked handicappers yet" from being used to mask a failed
  // or mis-scoped query.
  'function emptyBoardState()',
]) {
  assert(html.includes(required), `leaderboards page missing protected token: ${required}`);
}

// ---- LEADERBOARD_SPORT_FILTER_20260823: statements the page must NOT make --
for (const banned of [
  // The client-side sport comparison that was the root cause: a `matchesSport`
  // predicate in applyHandicapperFilters() testing a per-row `sport` field
  // that GET /api/users/leaderboard has never returned, so it was always
  // false for every sport. Filtering by sport belongs in the query.
  'matchesSport',
  // Eligibility copy the API stopped enforcing on 2026-08-17.
  'positive net units',
  // A second, hardcoded copy of the minimum-picks rule. The control is the
  // single source of that number; a literal here silently overrode it in one
  // direction only (it could raise the floor, never lower it).
  'entry.totalPicks >= 5',
]) {
  assert(!html.includes(banned), `leaderboards page must not reintroduce: ${banned}`);
}

for (const cssToken of [
  'body::before',
  '.hero::after',
  // df54dc56 compacted the hero (was ~500px tall); the 5-column quick-stats grid
  // stayed but its min track narrowed from 150px to 94px.
  'grid-template-columns: repeat(5, minmax(94px, 1fr))',
  'appearance: none',
  '.empty-state {',
  'radial-gradient(circle at top, rgba(29, 127, 232,0.07)',
  '@media (max-width: 720px)',
]) {
  assert(html.includes(cssToken), `leaderboards premium visual CSS missing: ${cssToken}`);
}

assert(!html.includes('background: #fff'), 'leaderboards page must not reintroduce bright white panels');
assert(!html.includes('background: white'), 'leaderboards page must not reintroduce white panels');
assert(html.includes('No fake records.'), 'leaderboards hero must keep no-fake-records trust copy');

console.log('leaderboards page visual regression test passed');
