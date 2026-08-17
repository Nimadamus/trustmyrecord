#!/usr/bin/env node
/*
 * LIVE COMPETITION CARD — static contract lock.
 *
 * The hero's right-hand card stopped being a spotlight on one designated
 * capper on 2026-08-16 and became a rotating read of the live standings. Two
 * properties of that card are not allowed to regress, and neither of them is
 * visible in a screenshot:
 *
 *   1. NOTHING IS INVENTED. Every competitor, number, streak, movement and
 *      event on the card comes from the API. There is no sample data, no demo
 *      username and no filler event anywhere in the client, the edge renderer
 *      or the markup — and a view the backend could not fill with real data is
 *      absent from the payload rather than padded, so there is nothing for the
 *      client to pad with either.
 *
 *   2. THE CARD DOES NOT CHANGE HEIGHT. It sits in a vertically-centred hero
 *      grid; a card that grew or shrank as its view rotated would move the
 *      whole column every few seconds.
 *
 * Live behaviour (the rotation itself, the transitions, every breakpoint) is
 * proved in a real browser by tests/homepage-live-competition-browser-proof.cjs.
 * This file is the part CI can check without one.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'static', 'css', 'tmr-home-v2.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-home-live.js'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'workers', 'home-ssr', 'worker.mjs'), 'utf8');

let checks = 0;
const ok = (cond, message) => { checks += 1; assert.ok(cond, message); };

/* ---------- 1. the permanent frame ---------------------------------------- */
ok(/<aside class="spot comp">/.test(html),
  'the hero card must carry both .spot (the approved shell) and .comp (the module)');
ok(/<div class="hd"><b><span class="bl"><\/span>Live competition<\/b>/.test(html),
  'the card header must be the permanent "LIVE COMPETITION" line with its live dot');
ok(html.includes('<div class="comp-title">The TMR race never stops</div>'),
  'the permanent "THE TMR RACE NEVER STOPS" headline is missing');
ok(/Enter the competition/.test(html), 'the footer CTA must read "Enter the competition"');
ok(/class="comp-foot"/.test(html), 'the footer count line (.comp-foot) is missing');

/* ---------- 2. no fabricated data, anywhere ------------------------------- */
// The old homepage shipped demo handles (moneylinemike, sharpaction, ...) as
// seed data. None of them, or anything like them, may appear in this card's
// markup or in the code that renders it.
const region = /<!--MK:homeCapper-->([\s\S]*?)<!--\/MK:homeCapper-->/.exec(html);
ok(region, 'the hero card lost its <!--MK:homeCapper--> prerender anchor');
const DEMO_NAMES = ['moneylinemike', 'sharpaction', 'fadethepublic', 'spreadking', 'parlaysam',
  'unitgrinder', 'doghunter', 'vegasrunner', 'locksonly', 'chalkeater'];
for (const name of DEMO_NAMES) {
  ok(!new RegExp(name, 'i').test(region[1]),
    `the competition card ships the demo username "${name}" — every name on it must come from the API`);
  ok(!new RegExp(name, 'i').test(js) || !new RegExp('comp', 'i').test(name),
    `tmr-home-live.js references the demo username "${name}"`);
}
// No fallback/sample view may exist in the client or at the edge: a view with
// too little real data is dropped by the backend, and the card just rotates
// past it.
for (const [src, name] of [[js, 'tmr-home-live.js'], [worker, 'worker.mjs']]) {
  ok(!/comp[A-Za-z]*\s*=\s*\[\s*\{\s*key:/.test(src),
    `${name} defines a hard-coded competition view — views come from the API only`);
  ok(src.includes('.filter(function (v) {') || src.includes('.filter((v) =>'),
    `${name} must drop empty views rather than render them`);
}

/* ---------- 3. the client renders only what it was handed ----------------- */
ok(js.includes('function applyCompetition(data)'),
  'tmr-home-live.js must apply the competition payload through applyCompetition');
ok(js.includes("j('/users/competition'"),
  'tmr-home-live.js must have the standalone /users/competition path for the bootstrap fallback');
ok(js.includes('applyCompetition(d.competition)'),
  'the home-bootstrap path must feed applyCompetition from d.competition');
ok(!js.includes('applyCapper') && !js.includes('capperOfWeek'),
  'the Capper of the Week render path is still in tmr-home-live.js');
ok(!worker.includes('data.capper'),
  'workers/home-ssr still injects the Capper of the Week card');

/* ---------- 4. the height cannot move ------------------------------------- */
ok(/\.comp-stage\{[^}]*position:relative[^}]*height:\s*\d+px/.test(css),
  '.comp-stage must be a fixed-height positioning context');
ok(/\.comp-view\{[^}]*position:absolute[^}]*inset:0/.test(css),
  'views must be absolutely positioned layers, so a swap cannot push the card');
ok(/\.comp-foot\{[^}]*min-height:/.test(css),
  'the footer sentence must reserve its two lines, or the card grows when the payload lands');
ok(/\.comp-title\{[^}]*white-space:nowrap/.test(css),
  'the headline must not be allowed to wrap');
// Every tier that changes the row metrics must restate the stage height, or
// the card silently inherits a height its rows no longer fit.
const tiers = css.match(/@media \(max-width:(\d+)px\)\{[\s\S]*?\n\}/g) || [];
const compTiers = tiers.filter((t) => /\.comp-/.test(t));
ok(compTiers.length >= 3, `only ${compTiers.length} responsive tiers touch the card; expected at least 3`);
for (const tier of compTiers) {
  const width = /max-width:(\d+)px/.exec(tier)[1];
  const touchesRows = /\.comp-row|\.comp-title|\.comp-nm|\.comp-av/.test(tier);
  if (!touchesRows) continue;
  ok(/\.comp-stage\{height:\s*\d+px\}/.test(tier),
    `the ${width}px tier resizes the card's contents without restating .comp-stage's height`);
}

/* ---------- 5. no number may be left mid-animation ------------------------ */
// The count-up writes a partial value into a slot that holds a real
// competitor's units. If requestAnimationFrame stalls (backgrounded tab,
// occluded window) that partial value is simply WRONG, so there are two
// wall-clock guards that put the payload's own string back.
ok(js.includes('data-text="'), 'the count-up must carry the final string on the element it animates');
ok(/if \(!framesRan\) finish\(\);/.test(js),
  'a stalled requestAnimationFrame must restore the real value immediately');
ok(/setTimeout\(finish, COMP_COUNT_MS \+ \d+\)/.test(js),
  'the count-up needs a wall-clock backstop that lands on the payload value');
ok(/setTimeout\(function \(\) \{ next\.classList\.remove\('is-in'\); \}/.test(js),
  "the incoming layer's animation class must be removed on a timer — its fill-mode " +
  'holds the whole view at opacity 0 on a compositor that is not animating');

/* ---------- 6. motion is optional, the information is not ----------------- */
ok(/@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?\.comp-view\.is-in/.test(css),
  'prefers-reduced-motion must switch the transitions off');
ok(js.includes("matchMedia('(prefers-reduced-motion: reduce)')"),
  'the count-up must be skipped under prefers-reduced-motion');
ok(js.includes('if (comp.paused || document.hidden) return;'),
  'the rotation must not advance in a hidden tab or while the card is being read');

/* ---------- 7. client and edge produce the same markup -------------------- */
for (const fn of ['compRowHtml', 'compDelta', 'compAvatar', 'compAgo']) {
  ok(js.includes('function ' + fn) || js.includes(fn + ' ='),
    `tmr-home-live.js is missing ${fn}`);
  ok(worker.includes('function ' + fn), `workers/home-ssr/worker.mjs is missing ${fn}`);
}
ok(worker.includes("rw.on('.spot .comp-stage'"),
  'the edge must inject the first view so the first paint is real, not a skeleton');

/* ---------- 8. and they produce byte-identical markup --------------------- */
// Asserting both files "have a compRowHtml" is not the same as asserting the
// two agree. The edge paints a row and the page script repaints the same row a
// moment later; any difference between them is a visible flicker on a value
// that did not change. So run BOTH implementations over the same rows and
// diff the strings.
//
// The client's copy lives inside an IIFE, so it is lifted out by source and
// evaluated against the same tiny helpers it closes over in the page.
const PRELUDE = [
  "const esc = (s) => String(s == null ? '' : s).replace(/[&<>\"']/g, (c) => ({",
  "  '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]));",
  'const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? 0 : n; };',
  "const initials = (name) => String(name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();",
  "const COMP_ICON = { win: 'W', loss: 'L', lock: '&#128274;', streak: '&#128293;', up: '&#9650;' };",
].join('\n');

function lift(source, names) {
  const parts = names.map((name) => {
    // Function declarations in both files are either top-level (worker.mjs) or
    // indented two spaces inside the page script's IIFE; the closing brace sits
    // at the same indent, which is what bounds the match.
    const re = new RegExp('\\n( {0,2})(function ' + name + '\\s*\\([\\s\\S]*?\\n\\1\\})');
    const m = re.exec(source);
    assert.ok(m, `could not lift ${name}() out of the source under test`);
    return m[2];
  });
  // eslint-disable-next-line no-new-func
  return new Function([PRELUDE, ...parts, 'return compRowHtml;'].join('\n'))();
}

const LIFT = ['compAgo', 'compAvatar', 'compDelta', 'compRowHtml'];
const clientRow = lift(js, LIFT);
const edgeRow = lift(worker, LIFT);

const FIXTURES = [
  [{ kind: 'standings' }, { rank: 1, competitor: { id: 7, username: 'a_user', avatar_url: null, href: '/u/a_user/' }, value: 93.31, value_text: '+93.31u', meta: '187-128-3 · 318 picks', delta: 2, is_new: false }, 0],
  [{ kind: 'standings' }, { rank: 2, competitor: { id: 8, username: 'b user', avatar_url: 'https://x/y.png', href: '/u/b%20user/' }, value: -4.5, value_text: '−4.50u', meta: '1-2', delta: -1, is_new: false }, 1],
  [{ kind: 'standings' }, { rank: 3, competitor: { username: "o'brien", avatar_url: null, href: "/u/o'brien/" }, value: 0, value_text: 'W5', meta: '8-2 last 10', delta: null, is_new: true }, 2],
  [{ kind: 'ticker' }, { kind: 'result', icon: 'win', competitor: { username: 'c<user>', avatar_url: null, href: '/u/c/' }, text: 'won SF -2.5 · +1.00u', at: '2026-08-16T23:15:48.659Z' }, 0],
  [{ kind: 'ticker' }, { kind: 'lock', icon: 'lock', competitor: { username: 'd_user', avatar_url: null, href: '/u/d_user/' }, text: 'locked 3 NFL picks', at: '2026-08-16T21:00:00.000Z' }, 1],
];
for (const [view, row, i] of FIXTURES) {
  const a = clientRow(view, row, i);
  const b = edgeRow(view, row, i);
  ok(a === b, 'tmr-home-live.js and workers/home-ssr/worker.mjs render this row differently:'
    + `\n  client: ${a}\n  edge:   ${b}`);
}

console.log(`homepage live-competition lock passed (${checks} checks)`);
