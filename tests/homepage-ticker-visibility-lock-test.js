#!/usr/bin/env node
// HOMEPAGE MLB TICKER VISIBILITY LOCK — added 2026-08-02 after the ticker went
// missing from the live homepage for a whole day.
//
// The regression was NOT a deleted component. index.html still shipped the
// ticker and /nav/mlb-slate still returned eight real games with trends. Two
// things combined:
//
//   1. ticker() treated an EMPTY data-slate-date ("" — how the document ships)
//      as a STALE baked slate and did `lane.innerHTML = ''`, so the lane held
//      zero .gm cards while the slate request was in flight.
//   2. integritySweep() ran at 4s and did `t.style.display = 'none'` on any
//      ticker with no .gm cards. /nav/mlb-slate answers in ~6s on production,
//      so the sweep hid the ticker before its data landed — and nothing ever
//      un-hid it. The slate then rendered eight games into a display:none box.
//
// The rule this file locks: the ticker NEVER disappears. It shows a loading,
// empty or error message in its own lane instead, and any inline hide is
// cleared whenever the lane is (re)painted.
//
// Wired into `npm run test:homepage` (and test:ci) — an unwired test is an
// invisible test.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const jsPath = path.join(ROOT, 'static', 'js', 'tmr-home-live.js');
const js = fs.readFileSync(jsPath, 'utf8');

/* ---------- 1. the component still ships in the document ---------- */
const HTML_REQUIRED = [
  '<div class="ticker">',
  'class="ticker-games" data-slate-date=""',
  // UPDATED 2026-08-03: the lane no longer ships a one-line loading message.
  // That message was 36px tall where a real matchup card is 76px, so every
  // slate that landed grew the strip by 40px and shoved the entire hero down.
  // It ships dimensionally identical skeleton cards instead, and the lane
  // reserves a card's full height from the first frame.
  // UPDATED 2026-08-20: a card carried two recent-form lines under the matchup,
  // so a real card was 117px and the reservation moved with it.
  // UPDATED 2026-08-21: those two form rows and the trend row became ONE
  // rotating intel line, so the card came down to 89px (measured in Chromium,
  // not estimated) and the reservation came down with it. The rule being locked has never changed: the skeleton box and
  // the card box are the same box, whatever that box currently measures.
  'class="gm is-skel"',
  // Scaled 1.2x for the 2026-08-23 homepage size restore (89px -> 107px,
  // 284px -> 341px), then a further 1.25x for the 2026-08-24 pass
  // (107px -> 134px, rounded to whole pixels). The skeleton WIDTH is 454px,
  // not the plain 341*1.25=426: the real card's width comes from .gm-in
  // (406px, stated once) plus .gm's own padding+border (48px), after
  // .gm .gm-top{width:100%} was added same-day to stop .gm-top's
  // font-dependent content width occasionally exceeding .gm-in's and
  // re-flowing the card mid-rotation (bl-86, ticker-insight-strip-browser-proof).
  // The mobile card (103px, inside a max-width:640px block) is untouched by
  // design — that scale-up was desktop-only.
  '.ticker-games,.ticker-track,.ticker-page{min-height:134px}',
  '.gm.is-skel{width:454px;height:134px',

  'role="status">Loading today&rsquo;s MLB slate&hellip;</span>',
];
for (const needle of HTML_REQUIRED) {
  assert.ok(html.includes(needle), 'index.html missing ticker markup: ' + needle);
}

/* ---------- 2. nothing may hide the ticker element ---------- */
const HIDE_RE = /\.ticker[\s\S]{0,160}?style\.display\s*=\s*['"]none['"]/;
assert.ok(!HIDE_RE.test(js),
  'tmr-home-live.js hides the .ticker element. The ticker must never be removed ' +
  'from the layout — render a message in .ticker-games instead.');
assert.ok(!/t\.style\.display = 'none'/.test(js),
  'the exact integritySweep hide that caused the 2026-08-02 outage is back');

/* ---------- 3. the loading/empty/error states exist ---------- */
const JS_REQUIRED = [
  'var LOADING_TEXT',
  'var UNAVAILABLE_TEXT',
  'function showTicker()',
  'var tickerSettled = false;',
  // renderTicker marks the request settled and reveals before painting
  'tickerSettled = true;',
  'laneMsg(lane, UNAVAILABLE_TEXT',
  "laneMsg(lane, 'No MLB games scheduled today'",
  // the sweep reports state instead of hiding
  'if (tickerSettled) laneMsg(lane, UNAVAILABLE_TEXT',
  // a height-reserving skeleton lane, never an empty or collapsed one
  'function laneSkeleton(lane)',
];
for (const needle of JS_REQUIRED) {
  assert.ok(js.includes(needle), 'tmr-home-live.js missing ticker state handling: ' + needle);
}

/* ---------- 4. an empty baked date is "nothing baked", not "stale" ---------- */
assert.ok(js.includes('if (baked && baked !== today) laneSkeleton(lane);'),
  'the baked-slate check must treat an empty data-slate-date as "nothing baked" and ' +
  'must leave a height-reserving skeleton lane, never an empty one');
assert.ok(!js.includes("if (baked !== null && baked !== today) lane.innerHTML = '';"),
  'the lane-emptying baked-date check that started the 2026-08-02 outage is back');

/* ---------- 4b. the sweep must not read skeletons as a populated lane ------- */
assert.ok(js.includes(".querySelectorAll('.gm:not(.is-skel)')"),
  'integritySweep counts skeleton cards as real games — a slate that never ' +
  'arrives would then shimmer forever instead of reporting the honest state');
/* ---------- 4c. nothing may collapse the lane to zero height ---------------- */
assert.ok(!/lane\.innerHTML\s*=\s*''/.test(js),
  'emptying the ticker lane collapses the strip and drags the hero up with it — ' +
  'use laneSkeleton(lane) or laneMsg(lane, …) instead');

/* ---------- 5. every game is uniquely identified (doubleheaders) ---------- */
assert.ok(js.includes('data-game-pk="'),
  'ticker cards must carry data-game-pk so both halves of a doubleheader stay distinct');

/* ---------- 5b. a page must outlive the longest line on it ------------------ */
/* The page rotation and the per-card dwell are two numbers in two places that
   have to be read together: if a card can hold a line for longer than its page
   stays on screen, the slowest cards are GUARANTEED to be slid away mid
   sentence and that line is never read in full. This shipped broken once - the
   band was raised to 14-22s while the page stayed on 18s - and the comment
   above it claimed the invariant held. Hence a test rather than a comment. */
/* Plain indexOf, no regex: a backslash class written through a shell heredoc
   has arrived here halved more than once, and a pattern that silently matches
   nothing turns this whole check into a test that always passes. */
const numOf = (name) => {
  const marker = 'var ' + name + ' = ';
  const at = js.indexOf(marker);
  assert.ok(at !== -1, 'cannot find ' + name + ' in tmr-home-live.js');
  const n = parseInt(js.slice(at + marker.length), 10);
  assert.ok(Number.isFinite(n), name + ' is not a number in tmr-home-live.js');
  return n;
};
const rotate = numOf('TICKER_ROTATE_MS');
const maxDwell = numOf('POSTGAME_DWELL_MIN_MS')
  + (numOf('POSTGAME_DWELL_STEPS') - 1) * numOf('POSTGAME_DWELL_STEP_MS');
assert.ok(rotate >= maxDwell,
  'TICKER_ROTATE_MS (' + rotate + 'ms) is shorter than the longest card dwell ('
  + maxDwell + 'ms) - the slowest cards get carried off screen mid-line');

/* ---------- 5c. hidden pages must not burn their lines ---------------------- */
/* Pages are slid sideways, so every card stays in the DOM and a naive
   document-wide query counts down cards nobody can see. */
assert.ok(js.includes('var all = visibleStrips();'),
  'the insight countdown is not scoped to the visible page - cards on pages that '
  + 'are slid off screen advance their lines with nobody watching');
assert.ok(js.includes('resetVisibleDwell();'),
  'a page sliding into view does not restart its cards - the line on screen '
  + 'inherits whatever was left of the last countdown instead of a full dwell');

/* ---------- 6. the document and its hashed JS twin are the same build ---------- */
const buildAttr = /data-tmr-build="([0-9a-f]{12})"/.exec(html);
assert.ok(buildAttr, 'index.html is missing data-tmr-build');
const build = buildAttr[1];
const srcRef = new RegExp('src="/static/js/tmr-home-live\\.' + build + '\\.js"');
assert.ok(srcRef.test(html),
  'index.html <script src> does not point at the tmr-home-live twin for build ' + build);

const twin = path.join(ROOT, 'static', 'js', 'tmr-home-live.' + build + '.js');
assert.ok(fs.existsSync(twin), 'missing hashed twin: ' + path.basename(twin));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
assert.strictEqual(sha(fs.readFileSync(twin)), sha(fs.readFileSync(jsPath)),
  'tmr-home-live.' + build + '.js differs from tmr-home-live.js — the deployed twin is stale');

console.log('homepage MLB ticker visibility lock passed (build ' + build + ')');
