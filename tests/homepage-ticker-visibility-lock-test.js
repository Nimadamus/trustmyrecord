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
  'class="gm is-skel"',
  '.ticker-games,.ticker-track,.ticker-page{min-height:76px}',
  '.gm.is-skel{width:230px;height:76px',
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
