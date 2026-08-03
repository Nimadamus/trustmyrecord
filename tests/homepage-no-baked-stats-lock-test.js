#!/usr/bin/env node
// HOMEPAGE "NO BAKED STATISTICS" LOCK — added 2026-08-03.
//
// The regression this prevents: for weeks the homepage document shipped
// hard-coded figures that were simply wrong by the time anyone loaded it.
//
//   hero eyebrow          "2,348 picks tracked"      live value: 2,707
//   stats stripe          "2,710"                    live value: 2,707
//   capper card footer    "353 picks, ..."           live value: 196
//   capper card body      "196 tracked picks"        live value: 196
//
// The last two sat 22px apart on the SAME card and disagreed with each other,
// because the prerender bake only rewrites the two <!--MK:--> regions and the
// eyebrow and the footer live outside them. Visitors saw all four numbers
// paint, then change, seconds later. It read as a broken, badly cached site.
//
// The rule this file locks: NO homepage statistic is baked into index.html.
// Every one of them ships as a skeleton and is filled at request time by
// workers/home-ssr (or, if that fails, by static/js/tmr-home-live.js). A
// placeholder can never be out of date; a baked number always can be.
//
// Wired into `npm run test:homepage` (and test:ci) — an unwired test is an
// invisible test.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-home-live.js'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'workers', 'home-ssr', 'worker.mjs'), 'utf8');

/* ---------- 1. every live figure ships as a skeleton, not a number --------- */
// id -> what it holds. Each must contain a placeholder and no digits.
const SKELETON_SLOTS = [
  ['tmrEyebrowPicks', 'hero eyebrow "picks tracked" count'],
  ['tmrStatPicks', 'stats stripe: Picks Tracked'],
  ['tmrStatCappers', 'stats stripe: Verified Cappers'],
  ['tmrStatMembers', 'stats stripe: Members'],
];
for (const [id, what] of SKELETON_SLOTS) {
  const m = new RegExp('id="' + id + '">([\\s\\S]*?)</').exec(html);
  assert.ok(m, `index.html is missing #${id} (${what})`);
  assert.ok(/class="sk"/.test(m[1]),
    `#${id} (${what}) must ship a <i class="sk"> placeholder, not a value: ${m[1]}`);
  // Digits inside attributes (the placeholder's own width) are not values —
  // strip the markup and check what a visitor would actually read.
  const shown = m[1].replace(/<[^>]*>/g, '').trim();
  assert.ok(!/\d/.test(shown),
    `#${id} (${what}) has a baked number in it — that number WILL go stale: ${shown}`);
}

/* ---------- 2. the capper card ships as a skeleton ------------------------- */
const capper = /<!--MK:homeCapper-->([\s\S]*?)<!--\/MK:homeCapper-->/.exec(html);
assert.ok(capper, 'index.html lost the <!--MK:homeCapper--> region');
assert.ok(/class="bd is-skel"/.test(capper[1]),
  'the Capper of the Week card must ship in its skeleton state (class="bd is-skel")');
for (const needle of ['tracked picks', 'win rate', 'avg odds']) {
  assert.ok(!capper[1].includes(needle),
    `the capper card has a baked "${needle}" sentence — it must be a skeleton`);
}

/* ---------- 3. the two pick counts on the capper card cannot disagree ------ */
// Both come from card.user.total_picks, in the client AND at the edge. If one
// of them is ever fed from a different field they will drift apart again.
const FT_SENTENCE = "num(u.total_picks) + ' picks, every one locked pre-game'";
assert.ok(js.includes(FT_SENTENCE),
  'tmr-home-live.js must write the capper footer count from u.total_picks');
assert.ok(js.includes("num(u.total_picks) + ' tracked picks'"),
  'tmr-home-live.js must write the capper sub-line count from u.total_picks');
assert.ok(worker.includes('${num(u.total_picks)} picks, every one locked pre-game'),
  'worker.mjs must write the capper footer count from u.total_picks');
assert.ok(worker.includes('${num(u.total_picks)} tracked picks'),
  'worker.mjs must write the capper sub-line count from u.total_picks');

/* ---------- 4. the footer count is not baked ------------------------------- */
assert.ok(!/\d[\d,]* picks, every one locked pre-game/.test(html),
  'the capper card footer has a baked pick count — this is the "353 vs 196" bug');

/* ---------- 5. the hero eyebrow and the stripe read the SAME source -------- */
assert.ok(js.includes("setText(document.getElementById('tmrEyebrowPicks'), picksText)"),
  'the hero eyebrow must be written from the same picksText as the stats stripe, ' +
  'or the two "picks tracked" figures on one screen can disagree');
assert.ok(worker.includes("rw.on('#tmrEyebrowPicks', new TextCell(picksText))") &&
          worker.includes("rw.on('#tmrStatPicks', new TextCell(picksText))"),
  'worker.mjs must inject the eyebrow and the stripe from the same picksText');

/* ---------- 6. the worker covers the routable URL shapes of the homepage --- */
// A Cloudflare route pattern matches the FULL URL. `trustmyrecord.com/` alone
// does not match `trustmyrecord.com/?utm_source=…` or `/index.html`, so ad
// clicks, shared links and the explicit filename bypassed the injection.
// /index.html is routable; the query-string shapes are not (Cloudflare rejects
// "?" in a pattern), and they do not need to be — the document ships skeletons,
// so the un-injected path is placeholder-then-value, never stale-then-value.
const wrangler = fs.readFileSync(path.join(ROOT, 'workers', 'home-ssr', 'wrangler.toml'), 'utf8');
for (const host of ['trustmyrecord.com', 'www.trustmyrecord.com']) {
  for (const suffix of ['/', '/index.html']) {
    assert.ok(wrangler.includes(`pattern = "${host}${suffix}"`),
      `workers/home-ssr/wrangler.toml is missing the route ${host}${suffix} — ` +
      'that URL shape would serve the un-injected document');
  }
}
assert.ok(!/pattern = "[^"]*\?/.test(wrangler),
  'Cloudflare rejects a route pattern containing a query string (code 10022) — ' +
  'the deploy will fail with "Route pattern should not have query parameters"');
assert.ok(worker.includes("const HOME_PATHS = new Set(['/', '/index.html'])"),
  'worker.mjs must re-check the pathname itself, not trust the route config alone');

/* ---------- 7. no placeholder may shimmer forever ------------------------- */
assert.ok(js.includes('function capperSettled()'),
  'tmr-home-live.js must settle the capper card skeleton on the failure path too');
assert.ok(js.includes('function statsSettled()'),
  'tmr-home-live.js must resolve leftover stat placeholders as soon as the stats ' +
  'requests settle, rather than leaving them shimmering until a timer fires');
assert.ok(js.includes('function placeholderSweep()') && js.includes('setTimeout(placeholderSweep'),
  'a last-resort deadline must dash any placeholder that never got filled');
// The 4s integrity sweep must NOT be the thing that dashes them: a backend
// having a slow minute answers after it, and dashing at 4s only to write the
// real value at 5s is the same visible swap this whole change removes.
const sweepStart = js.indexOf('function integritySweep()');
const sweepEnd = js.indexOf('setTimeout(integritySweep', sweepStart);
assert.ok(sweepStart !== -1 && sweepEnd > sweepStart,
  'could not find integritySweep() in tmr-home-live.js');
assert.ok(!js.slice(sweepStart, sweepEnd).includes('tmrEyebrowPicks'),
  'integritySweep (4s) must not resolve statistic placeholders — that is ' +
  "placeholderSweep's job, and it deliberately runs much later");

console.log(
  `homepage no-baked-stats lock passed (${SKELETON_SLOTS.length} stat slots, ` +
  'capper card, worker routes)'
);
