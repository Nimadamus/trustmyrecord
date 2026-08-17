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
  ['tmrStatCappers', 'stats stripe: Pick Makers'],
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

/* ---------- 2. the hero card ships as a skeleton --------------------------- */
// The <!--MK:homeCapper--> region held the Capper of the Week card until
// 2026-08-16 and now holds the LIVE COMPETITION module. The marker name is kept
// so the prerender anchor (scripts/prerender_home_snapshot.cjs) and the edge
// renderer keep pointing at the same region; what it contains changed, the rule
// that it must ship EMPTY did not.
const spotRegion = /<!--MK:homeCapper-->([\s\S]*?)<!--\/MK:homeCapper-->/.exec(html);
assert.ok(spotRegion, 'index.html lost the <!--MK:homeCapper--> region');
assert.ok(/class="bd is-skel"/.test(spotRegion[1]),
  'the hero card must ship in its skeleton state (class="bd is-skel")');

/* ---------- 3. no competitor, number or event is baked into the card ------- */
// The card names real members and prints their real units. A baked row would be
// a WRONG member with a WRONG number on the front page — the same class of bug
// as the stale counts above, with somebody's name attached.
// The permanent headline is copy, not a statistic: it is the same sentence on
// every load and cannot go stale, so it is the one thing in here that is baked.
// Everything else in the region must read empty.
const rowText = spotRegion[1]
  .replace(/<div class="comp-title">[\s\S]*?<\/div>/, '')
  .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
assert.strictEqual(rowText, '',
  `the competition card has baked content — every row must be a skeleton: ${rowText}`);
assert.ok(/<div class="comp-title">The TMR race never stops<\/div>/.test(spotRegion[1]),
  'the permanent LIVE COMPETITION headline is missing from the card');
for (const needle of ['comp-nm" href', 'data-val=', 'comp-ago', 'comp-dl']) {
  assert.ok(!spotRegion[1].includes(needle),
    `the competition card ships a rendered "${needle}" — rows must arrive from the API, never from the markup`);
}
// The footer counts ship as a placeholder for the same reason.
const compFoot = /<span class="comp-foot">([\s\S]*?)<\/span>/.exec(html);
assert.ok(compFoot, 'index.html lost the competition card footer (.comp-foot)');
assert.ok(/class="sk"/.test(compFoot[1]) && !/\d/.test(compFoot[1].replace(/<[^>]*>/g, '')),
  `the competition footer has a baked count — it must be a skeleton: ${compFoot[1]}`);

/* ---------- 4. client and edge render the card from ONE payload shape ------ */
// Both write the footer sentence from footer.competitors / footer.verified_picks
// and both build rows through compRowHtml. If either drifts, the edge paints one
// thing and the script repaints another — a visible swap on load.
assert.ok(js.includes("' competitors · '") && js.includes("' verified picks · standings update live'"),
  'tmr-home-live.js must write the competition footer sentence from the payload footer');
assert.ok(worker.includes('competitors · ') && worker.includes('verified picks · standings update live'),
  'worker.mjs must write the same competition footer sentence as the client');
for (const [src, name] of [[js, 'tmr-home-live.js'], [worker, 'worker.mjs']]) {
  assert.ok(src.includes('compRowHtml'),
    `${name} must build competition rows through compRowHtml so the two stay byte-identical`);
}

/* ---------- 5. the hero eyebrow and the stripe read the SAME source -------- */
assert.ok(js.includes("setText(document.getElementById('tmrEyebrowPicks'), picksText)"),
  'the hero eyebrow must be written from the same picksText as the stats stripe, ' +
  'or the two "picks tracked" figures on one screen can disagree');
assert.ok(worker.includes("rw.on('#tmrEyebrowPicks', new TextCell(picksText))") &&
          worker.includes("rw.on('#tmrStatPicks', new TextCell(picksText))"),
  'worker.mjs must inject the eyebrow and the stripe from the same picksText');

/* ---------- 5b. "Picks Tracked" is the site-wide canonical count ---------- */
// Added 2026-08-10. The homepage read /users/directory-counts
// `counts.total_valid_picks` — every non-deleted row in the picks table,
// including pending picks, voids, and picks owned by banned, soft-deleted and
// QA accounts — and printed 3,022 while /handicappers/ printed the real
// figure, 2,738, from metrics.total_graded_picks. Two labels for one quantity,
// two queries. metrics.total_graded_picks is produced in exactly one place
// (backend services/siteStatsService.js) and is the only source allowed here.
// Both the edge injection and the client repaint must read it, or the visitor
// watches the number change on load.
for (const [src, name] of [[js, 'tmr-home-live.js'], [worker, 'worker.mjs']]) {
  assert.ok(/metrics|\bm\b|\bd\.metrics\b/.test(src) && src.includes('total_graded_picks'),
    `${name} must take the "Picks Tracked" figure from metrics.total_graded_picks ` +
    '— the one site-wide count /handicappers/ also displays');
  assert.ok(!src.includes('total_valid_picks'),
    `${name} still references total_valid_picks — that is the raw-table ops/debug ` +
    'count (pending + void + banned/QA accounts), NOT the site-wide statistic. ' +
    'This is the exact 3,022-vs-2,738 split-source bug.');
  assert.ok(!/directory-counts/.test(src),
    `${name} must not call /users/directory-counts — it is an ops endpoint and ` +
    'nothing it returns may be painted on a public page');
}

/* ---------- 5c. the second stripe cell says what it counts --------------- */
// Added 2026-08-10. The tile read "Verified Cappers" over
// total_eligible_handicappers = members with at least one GRADED pick (37).
// "Verified" on /handicappers/ means 25+ graded picks — 14 members — so the
// homepage was overstating the verified population by 2.6x with a number that
// was not even the verified definition. It is now "Pick Makers" over
// metrics.pick_makers: same label, same field, same definition as the
// /handicappers/ card. total_eligible_handicappers keeps the "public records"
// badge, where the words match the figure.
assert.ok(/id="tmrStatCappers"[\s\S]{0,200}?<span>Pick Makers<\/span>/.test(html),
  'the second stats-stripe cell must be labelled "Pick Makers" — it carries ' +
  'metrics.pick_makers, not a count of verified handicappers');
assert.ok(!/<span>Verified Cappers<\/span>/.test(html),
  'index.html still says "Verified Cappers" — that label named neither the ' +
  'figure behind it nor the /handicappers/ definition of "verified" (25+ graded)');
for (const [src, name] of [[js, 'tmr-home-live.js'], [worker, 'worker.mjs']]) {
  assert.ok(src.includes('pick_makers'),
    `${name} must fill the Pick Makers cell from metrics.pick_makers so the ` +
    'homepage and /handicappers/ mean the same thing by the same word');
}
// The two figures must not be swapped back into one cell.
assert.ok(/public records/.test(js) && /public records/.test(worker),
  'total_eligible_handicappers must keep feeding the "public records" badge');

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
assert.ok(js.includes('function compSettled()'),
  'tmr-home-live.js must settle the competition card skeleton on the failure path too');
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
  'live-competition card, worker routes)'
);
