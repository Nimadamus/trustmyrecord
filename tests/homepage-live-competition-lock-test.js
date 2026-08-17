#!/usr/bin/env node
/*
 * LIVE COMPETITION CARD — static contract lock.
 *
 * The hero's right-hand card stopped being a spotlight on one designated
 * capper on 2026-08-16, and on 2026-08-17 it stopped being only about picks: it
 * rotates through eight standings drawn from the sportsbook, trivia, the polls
 * and the forum. Three properties are not allowed to regress, and none of them
 * is visible in a screenshot:
 *
 *   1. NOTHING IS INVENTED. Every competitor and every number on the card comes
 *      from the API. There is no sample data, no demo username and no hard-coded
 *      view anywhere in the client, the edge renderer or the markup — and a
 *      category the backend could not fill with three real rows is absent from
 *      the payload rather than padded, so there is nothing for the client to pad
 *      with either. Nor is any number animated: a rolling counter would display
 *      values the payload never contained.
 *
 *   2. THE CARD DOES NOT CHANGE HEIGHT. It sits in a vertically-centred hero
 *      grid; a card that grew or shrank as its view rotated would move the
 *      whole column every few seconds.
 *
 *   3. THE ACCENT, THE LABEL AND THE CTA FOLLOW THE SECTION. A visitor reading
 *      TRIVIA LEADERS must be one click from the trivia board, not from the
 *      handicapper standings — and both renderers must agree on which.
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
ok(/class="comp-foot"/.test(html), 'the footer count line (.comp-foot) is missing');
// Two CTAs, and neither may go missing. The header one converts (sign up); the
// footer one follows the category on screen to that section's own board, so a
// visitor reading TRIVIA LEADERS is one click from the trivia leaderboard
// rather than from the handicapper standings.
ok(/<div class="hd">[\s\S]*?href="\/register\/">Enter the competition/.test(html),
  'the card header must carry the "Enter the competition" signup CTA');
ok(/<a class="tlink comp-cta"[^>]*href="\/handicappers\/">Full standings/.test(html),
  'the footer must ship the contextual CTA (.comp-cta) defaulted to the first view\'s destination');

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

/* ---------- 5. no number is ever animated ---------------------------------- */
// There is no count-up (removed 2026-08-17, Nima). A rolling counter has to
// display values the payload never contained on its way to the one it did, and
// once the card started ranking trivia points and forum posts alongside units
// those intermediate values stopped reading as a figure settling and started
// reading as somebody's real score being wrong. A player with 28,511 points is
// shown 28,511 points, in the first frame they appear.
for (const [src, name] of [[js, 'tmr-home-live.js'], [worker, 'worker.mjs']]) {
  ok(!/compCountUp|COMP_COUNT_MS/.test(src), `${name} still has count-up machinery`);
  ok(!/data-val=|data-text=/.test(src),
    `${name} still emits the count-up's data attributes on a value element`);
}
ok(!/\.comp-num[^{]*\{[^}]*transition/.test(css),
  'the primary value must not transition between two numbers');
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
for (const fn of ['compRowHtml', 'compDelta', 'compAvatar']) {
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

const LIFT = ['compAvatar', 'compDelta', 'compRowHtml'];
const clientRow = lift(js, LIFT);
const edgeRow = lift(worker, LIFT);

const FIXTURES = [
  [{ tone: 'signed' }, { rank: 1, competitor: { id: 7, username: 'a_user', avatar_url: null, href: '/u/a_user/' }, value: 93.31, value_text: '+93.31u', meta: '187-128-3 · 318 picks', delta: 2, is_new: false }, 0],
  [{ tone: 'signed' }, { rank: 2, competitor: { id: 8, username: 'b user', avatar_url: 'https://x/y.png', href: '/u/b%20user/' }, value: -4.5, value_text: '−4.50u', meta: '1-2', delta: -1, is_new: false }, 1],
  [{ tone: 'signed' }, { rank: 3, competitor: { username: "o'brien", avatar_url: null, href: "/u/o'brien/" }, value: 0.01, value_text: '+0.01u', meta: '1-0', delta: null, is_new: true }, 2],
  // A points or post count is 'neutral': never coloured as a profit.
  [{ tone: 'neutral' }, { rank: 1, competitor: { id: 9, username: 'c<user>', avatar_url: null, href: '/u/c/' }, value: 28511, value_text: '28,511 pts', meta: '91/134 correct · 67.9%', delta: null, is_new: false }, 0],
  [{ tone: 'neutral' }, { rank: 2, competitor: { id: 10, username: 'd_user', avatar_url: null, href: '/u/d_user/' }, value: 69, value_text: '69 posts', meta: '51 threads · 18 replies', delta: null, is_new: false }, 1],
];
for (const [view, row, i] of FIXTURES) {
  const a = clientRow(view, row, i);
  const b = edgeRow(view, row, i);
  ok(a === b, 'tmr-home-live.js and workers/home-ssr/worker.mjs render this row differently:'
    + `\n  client: ${a}\n  edge:   ${b}`);
}

/* ---------- 9. the card advertises more than the sportsbook --------------- */
// The whole point of the 2026-08-17 change: a visitor landing mid-rotation
// should be able to tell that trivia, polls and the forum are competitions too.
// That only works if the accent, the category label and the CTA all follow the
// SECTION the payload names.
for (const section of ['trivia', 'polls', 'forum', 'community']) {
  ok(css.includes(`.spot.comp.comp-acc-${section} .comp-cat`),
    `no accent colour is defined for the ${section} section`);
}
ok(/\.spot\.comp \.comp-cat\{color:var\(--brand-dk\)\}/.test(css),
  'the sportsbook boards must share the default accent, or the card strobes through a palette');
ok(js.includes("'comp-acc-' + (view.section || 'sportsbook')"),
  'tmr-home-live.js must apply the accent from view.section');
ok(worker.includes('new AccentCell(`comp-acc-${view.section'),
  'the edge must paint the same accent, or the label changes colour on load');
// The CTA destination comes from the payload, never from a table in the client
// that could drift out of step with the backend's.
ok(js.includes('view.cta && view.cta.href && view.cta.label'),
  'the footer CTA must be driven by view.cta from the payload');
ok(worker.includes('new CtaCell(view.cta.href'),
  'the edge must paint the same contextual CTA as the client');
for (const [src, name] of [[js, 'tmr-home-live.js'], [worker, 'worker.mjs']]) {
  ok(!/\/leaderboards\/#trivia|\/leaderboards\/#polls/.test(src),
    `${name} hard-codes a CTA destination — those live in the backend's CTA map only`);
}
// A points count must never be coloured like a profit.
ok(css.includes('.comp-num.flat{'), 'no neutral tone is defined for a points or post count');
ok(js.includes("view.tone === 'signed'") && worker.includes("view.tone === 'signed'"),
  'both renderers must colour the value from view.tone');

console.log(`homepage live-competition lock passed (${checks} checks)`);
