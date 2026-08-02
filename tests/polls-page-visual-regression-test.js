#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'polls', 'index.html'), 'utf8');

// 2026-08-02 rebuild: the page became a deep-navy sports-media board —
// compact hero + live stats, a sticky league/view filter bar, a featured poll,
// a 3-up card grid with inline voting, real discussion threads, and quizzes in
// their own band. The pre-2026-08 markers (tmr-pcard / tmr-tab2 / #filterBar /
// tmr-fb-sidebar) are gone for good; lock the current shape instead.
for (const required of [
  // shell + hero
  'class="tmr-shell2"',
  'class="pl-hero"',
  '<h1>Sports Polls</h1>',
  'Vote on today&rsquo;s biggest games and see where the community stands.',
  'id="statOpen"',
  'id="statVotesToday"',
  'id="pollsPrompt"',
  'class="tmr-hbtn is-primary" id="createPollBtn"',
  // filter bar — every league + view chip the page ships with
  'id="pollsFilterBar"',
  'id="leagueChips"',
  'id="viewChips"',
  'data-league="MLB"',
  'data-league="NFL"',
  'data-league="NBA"',
  'data-league="WNBA"',
  'data-league="NHL"',
  'data-league="Other"',
  'data-view="open"',
  'data-view="ending"',
  'data-view="most_voted"',
  'data-view="voted"',
  'data-view="closed"',
  'id="searchInput"',
  // board structure
  'id="pollsResultLine"',
  'id="featuredSlot"',
  'id="pollsSection"',
  'id="quizBand"',
  'id="quizGrid"',
  'id="pollDetail"',
  // rendering pipeline
  'function featuredHtml(',
  'function cardHtml(',
  'function resultsHtml(',
  'function optionsHtml(',
  'function matchupRowHtml(',
  'function pollLeagueKey(',
  'function renderFromCache(',
  'function skeletonGridHtml(',
  'function emptyStateForView(',
  'function errorStateHtml(',
  // discussion is a real thread, not a dead link
  'id="pollDiscussion"',
  'function mountDiscussion(',
  'async function loadDiscussion(',
  'async function submitComment(',
  'function openPollDiscussion(',
  "'/comments?page='",
  // closed polls must say so in words, never colour alone
  'Poll Closed',
  'Final result',
  'Result pending',
  // the closed board is paged server-side, never dumped in one go
  "fetchPolls('closed'",
  'var CLOSED_PAGE_SIZE = 24;',
  'function closedPagerHtml(',
  'async function loadMoreClosed(',
  'function hasMoreClosed(',
  'id="closedLoadMore"',
]) {
  assert(html.includes(required), `polls page missing required visual/function marker: ${required}`);
}

for (const requiredStyle of [
  // token ramp — deep navy surfaces, teal accent, muted blue-gray secondary
  '--bg: #0A1322;',
  '--surface-1: #101B2C;',
  '--accent: #22D3EE;',
  '--text-2: #A7BAD1;',
  // layout: 3-up desktop grid, 2-up medium, 1-up mobile
  '.pl-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));',
  '.pl-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
  '.pl-grid { grid-template-columns: 1fr; gap: 11px; }',
  // sticky filter bar parked under the global nav
  '.pl-filterbar {',
  'position: sticky; top: var(--nav-h); z-index: 40;',
  // equal-width vote buttons, percentage fill inside the option after voting
  '.pl-opts { display: grid; gap: 8px; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); }',
  '.pl-res-fillbg {',
  // states
  '.pl-state {',
  '.pl-state.is-error .ic',
  '.pl-skel .sk',
  // accessibility
  ':focus-visible { outline: 2px solid var(--accent); outline-offset: 2px;',
  '@media (prefers-reduced-motion: reduce)',
  '@media (max-width: 1080px)',
  '@media (max-width: 900px)',
  '@media (max-width: 720px)',
]) {
  assert(html.includes(requiredStyle), `polls page missing required premium dark style: ${requiredStyle}`);
}

// The page background must stay deep navy, never pure black and never a pale panel.
assert(!html.includes('background: #fff'), 'polls page must not reintroduce a giant white panel');
assert(!html.includes('background:white'), 'polls page must not reintroduce a giant white panel');
assert(!html.includes('background-color: #fff'), 'polls page must not reintroduce a giant white panel');
assert(!html.includes('background: #f5f5f5'), 'polls page must not regress to pale admin gray');
assert(!/--bg:\s*#000/.test(html), 'polls page background must be deep navy, not pure black');
// background-attachment:fixed sizes the gradient to the viewport and leaves the
// rest of a long page unpainted — it caused a white band below the fold.
assert(!html.includes('background-attachment: fixed'), 'polls page must not use a fixed background attachment');
// Never noindex.
assert(!/noindex/i.test(html), 'polls page must never be noindexed');

console.log('polls page visual regression test passed');

// A TMR poll is a multi-question quiz on major AMERICAN sports — never a foreign
// fixture (Nima, 2026-08-02; enforced server-side in services/pollPolicy.js).
// The Soccer chip was removed as part of that rule, which is why the old
// 'data-league="Soccer"' assertion was dropped from the required list above.
// Guard the RULE instead of the removed marker, so the chip cannot come back.
[
  'data-league="Soccer"',
  'data-league="NPB"',
  'data-league="KBO"',
].forEach((banned) => {
  assert(
    !html.includes(banned),
    `polls board reintroduced a non-American league chip: ${banned}`
  );
});
