#!/usr/bin/env node
/*
 * HOMEPAGE ACTIVITY STRIP LOCK — the "LIVE ON TMR" module shares the ticker
 * row, and the rule for anything that shares that row is that the SPORTS
 * TICKER wins. This file locks the properties that keep that true:
 *
 *   1. the strip is a fixed-width flex item that cannot grow into the games
 *      lane after first paint (growing later re-pages the cards under the
 *      reader; only ever giving width BACK is safe);
 *   2. it keeps the lane's own 76px height, so it can never change the height
 *      of the ticker and push the hero down;
 *   3. it leaves the row entirely on smaller screens rather than squeezing the
 *      ticker;
 *   4. its one line of activity text truncates instead of wrapping;
 *   5. it respects prefers-reduced-motion;
 *   6. its script is content-hashed and paired with this exact document.
 *
 * Static source checks, so this runs in test:homepage with no browser.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const jsPath = path.join(ROOT, 'static', 'js', 'tmr-activity-feed.js');
const js = fs.readFileSync(jsPath, 'utf8');

/* ---------- 1. the module ships in the ticker row, after the games lane ---- */
const MARKUP = [
  '<div class="tkact" id="tmrActivity">',
  '<span class="tkact-lbl"><span class="bl"></span>Live on TMR</span>',
  '<div class="tkact-slot"></div>',
];
for (const needle of MARKUP) {
  assert.ok(html.includes(needle), 'index.html missing activity strip markup: ' + needle);
}
const laneAt = html.indexOf('class="ticker-games"');
const stripAt = html.indexOf('<div class="tkact" id="tmrActivity">');
const nextAt = html.indexOf('class="tk-nav tk-next"');
assert.ok(laneAt > -1 && stripAt > laneAt && nextAt > stripAt,
  'the activity strip must sit between the games lane and the next arrow, ' +
  'so it occupies the unused right-hand space without displacing either');

/* ---------- 2. it can only ever give width back ---------------------------- */
// Scaled 1.2x for the 2026-08-23 homepage size restore, then a further 1.25x
// for the 2026-08-24 pass (346px -> 433px, rounded to whole pixels). The
// media-query breakpoints themselves (1179px, 1439px) are viewport widths and
// stay exactly as approved.
assert.ok(/\.tkact\{flex:0 0 auto;width:433px/.test(html),
  'the strip must be a fixed-width, non-growing flex item (flex:0 0 auto). ' +
  'A growing strip would take width from the games lane after the cards have ' +
  'already been paged into it.');
assert.ok(!/\.tkact\{[^}]*flex:1/.test(html), 'the strip must never flex-grow into the games lane');

/* ---------- 3. it keeps the lane height exactly --------------------------- */
assert.ok(/\.tkact\{[^}]*height:114px/.test(html),
  'the strip must be exactly the 114px lane height a matchup card reserves, or ' +
  'it changes the height of the ticker and moves the hero');
assert.ok(/\.tkact-slot\{[^}]*height:60px/.test(html),
  'the rotating item needs a fixed slot: a taller item must not grow the row');

/* ---------- 4. it leaves the row before the ticker suffers ---------------- */
assert.ok(/@media \(max-width:1179px\)\{\.tkact\{display:none\}\}/.test(html),
  'below 1180px the row belongs to the sports ticker alone');
assert.ok(/@media \(max-width:1439px\)\{[\s\S]{0,200}\.tkact\{width:375px/.test(html),
  'the strip must narrow before it disappears, giving the lane width back in stages');

/* ---------- 5. one line, truncated, never wrapped ------------------------- */
for (const rule of [
  /\.tkact-act\{[^}]*text-overflow:ellipsis/,
  /\.tkact-act\{[^}]*white-space:nowrap/,
  /\.tkact-who b\{[^}]*text-overflow:ellipsis/,
]) {
  assert.ok(rule.test(html),
    'activity text and usernames must truncate — a long thread title or handle ' +
    'must not be able to reflow the ticker row');
}

/* ---------- 6. reduced motion -------------------------------------------- */
assert.ok(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]{0,240}\.tkact-item\{transition:none\}/.test(html),
  'the strip must not animate for a visitor who asked for reduced motion');

/* ---------- 7. failure behaviour is wired, not hoped for ------------------ */
const JS_REQUIRED = [
  'window.__tmrActivityFeedBooted',        // one instance per document
  'function collapse()',                   // the failure state is "not there"
  'if (++bootTries > BOOT_RETRIES) return collapse();',  // a dead endpoint still
                                           // hides the strip, after a BOUNDED
                                           // retry, so one cold Render start
                                           // does not delete it for the visit
  'seen[ev.id]',                           // an id is shown at most once
  'seenOld[ev.id]',                        // ...and the id set is TWO generations,
                                           // never cleared: clearing one set would
                                           // re-admit the whole current backlog on
                                           // the next poll and cycle it again
  "window.addEventListener('pagehide'",    // no leaked stream or timers
  'stream.close()',
  /* The strip must keep refreshing where the stream cannot run at all: no
     EventSource, a `busy` refusal from a backend at its connection cap, or a
     proxy that swallows text/event-stream. Without these it froze on the
     backlog it loaded at first paint and stayed frozen for the whole visit. */
  'function startPolling()',
  "stream.addEventListener('busy'",
  'if (!window.EventSource) return startPolling();',
];
for (const needle of JS_REQUIRED) {
  assert.ok(js.includes(needle), 'tmr-activity-feed.js missing safety wiring: ' + needle);
}
assert.ok(!/document\.write|innerHTML\s*=/.test(js),
  'the strip builds nodes, never HTML strings: a username is user input');

/* ---------- 8. the document and its hashed twin are the same build -------- */
const ref = /src="\/static\/js\/tmr-activity-feed\.([0-9a-f]{12})\.js"/.exec(html);
assert.ok(ref, 'index.html does not reference a content-hashed tmr-activity-feed.js');
const twin = path.join(ROOT, 'static', 'js', 'tmr-activity-feed.' + ref[1] + '.js');
assert.ok(fs.existsSync(twin), 'missing hashed twin: ' + path.basename(twin));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
assert.strictEqual(sha(fs.readFileSync(twin)), sha(fs.readFileSync(jsPath)),
  'tmr-activity-feed.' + ref[1] + '.js differs from its source — the deployed twin is stale; ' +
  'run: python scripts/build_home_critical.py');

console.log('homepage activity strip lock passed (build ' + ref[1] + ')');
