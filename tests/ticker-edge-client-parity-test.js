#!/usr/bin/env node
/*
 * TICKER EDGE/CLIENT MARKUP PARITY.
 *
 * The matchup card is rendered TWICE by two different files:
 *   - workers/home-ssr/worker.mjs paints it at the edge, into the document;
 *   - static/js/tmr-home-live.js paints it in the browser, on the 90s refresh.
 *
 * Both files carry their own copy of insightStrip() and pitcherLine(), and the
 * comment in each says "keep the two in lockstep". Nothing enforced it. When
 * they drift, the edge paints one card and the first client refresh silently
 * repaints a different one - which is how the rotation shipped broken on
 * 2026-08-21 (the client adopted the edge's lane and returned before starting
 * the rotation, so production sat on its first insight forever while every
 * fixture-driven test passed).
 *
 * This renders the SAME slate through BOTH implementations and diffs the bytes.
 * No browser and no network: both are pure string builders.
 *
 *   node tests/ticker-edge-client-parity-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'nav-mlb-slate-postgame.json');

/* ---- the edge implementation --------------------------------------------
   worker.mjs is an ES module whose only export is the fetch handler, so the
   body above `export default` is evaluated and the builders are handed back. */
const wsrc = fs.readFileSync(path.join(ROOT, 'workers', 'home-ssr', 'worker.mjs'), 'utf8');
const cut = wsrc.indexOf('export default');
if (cut < 0) throw new Error('worker.mjs no longer has an `export default` to cut at');
const edge = new Function(
  `${wsrc.slice(0, cut)};return {insightStrip,pitcherLine,postgameDwell};`
)();

/* ---- the client implementation -------------------------------------------
   tmr-home-live.js is one big IIFE bound to a DOM, so the three builders are
   lifted out by source text and evaluated on their own. Lifting the SOURCE
   (rather than re-implementing it here) is the point: this test can only pass
   if the real shipped function agrees with the real shipped worker. */
const csrc = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-home-live.js'), 'utf8');

function grab(name) {
  const start = csrc.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`client function not found: ${name}`);
  let depth = 0;
  for (let i = csrc.indexOf('{', start); i < csrc.length; i++) {
    if (csrc[i] === '{') depth += 1;
    else if (csrc[i] === '}') {
      depth -= 1;
      if (!depth) return csrc.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

function constOf(name) {
  const m = new RegExp(`var ${name} = (\\d+);`).exec(csrc);
  if (!m) throw new Error(`client constant not found: ${name}`);
  return m[1];
}

const ESC = 'function esc(s){return String(s == null ? "" : s).replace(/[&<>"\']/g,'
  + 'function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\'":"&#39;"}[c];});}';

const client = new Function(
  ['INSIGHT_ROTATE_MS', 'POSTGAME_DWELL_MIN_MS', 'POSTGAME_DWELL_STEP_MS', 'POSTGAME_DWELL_STEPS']
    .map((n) => `var ${n} = ${constOf(n)};`).join('')
  + ESC
  + grab('postgameDwell') + grab('insightStrip') + grab('pitcherLine')
  + ';return {insightStrip:insightStrip,pitcherLine:pitcherLine,postgameDwell:postgameDwell};'
)();

/* ---- diff ---------------------------------------------------------------- */
const slate = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const games = slate.games || [];
if (!games.length) throw new Error('fixture has no games');

const failures = [];
let compared = 0;

games.forEach((g) => {
  ['insightStrip', 'pitcherLine'].forEach((fn) => {
    compared += 1;
    const a = edge[fn](g);
    const b = client[fn](g);
    if (a === b) return;
    failures.push(`${fn} differs for ${g.away}@${g.home} (${g.status})\n`
      + `    edge  : ${a.slice(0, 240)}\n`
      + `    client: ${b.slice(0, 240)}`);
  });
  if (g.status !== 'final') return;
  compared += 1;
  const da = edge.postgameDwell(g);
  const db = client.postgameDwell(g);
  if (da !== db) failures.push(`postgameDwell differs for ${g.away}@${g.home}: edge ${da} vs client ${db}`);
});

/* The fixture has to actually exercise both modes, or this test passes by
   covering nothing. */
const finals = games.filter((g) => g.insight_mode === 'postgame');
/* 'live' is excluded explicitly: it is not a pregame card and counting it as
   one would let the pregame guard below pass on a fixture that has no pregame
   card in it at all. */
const pregame = games.filter((g) => g.insight_mode !== 'postgame'
  && g.insight_mode !== 'live' && (g.insights || []).length);
if (!finals.length) failures.push('fixture contains no postgame card - parity is untested for FINAL games');
if (!pregame.length) failures.push('fixture contains no pregame card - parity is untested for the pregame strip');
/* A LIVE card takes its own branch in insightStrip - it is postgame-shaped text
   on a game still being played, so it draws the postgame dwell while its
   data-mode still reads "live". That branch exists in two files and this is the
   only thing that checks they agree. */
const liveCards = games.filter((g) => g.insight_mode === 'live');
if (!liveCards.length) failures.push('fixture contains no live card - parity is untested for in-progress games');
liveCards.forEach((g) => {
  const html = client.insightStrip(g);
  if (html.indexOf('data-mode="live"') === -1) {
    failures.push(`live card ${g.away}@${g.home} does not report data-mode="live"`);
  }
  const dwell = Number((/data-dwell="(\d+)"/.exec(html) || [])[1]);
  if (dwell !== client.postgameDwell(g)) {
    failures.push(`live card ${g.away}@${g.home} rotates on ${dwell}ms, not the postgame dwell - a stat line cannot be read on the pregame beat`);
  }
});

/* THE BOTTOM LINE LABEL. The client and the worker each join `team_label` to
   the text themselves, so a fixture carrying no labels would compare two
   renderers that are both drawing nothing and call it agreement. */
const labelled = games.reduce((n, g) => n + (g.insights || []).filter((i) => i.team_label).length, 0);
if (!labelled) failures.push('fixture carries no team_label - the "Team Name: fact" join is untested');

if (failures.length) {
  console.log(`ticker edge/client parity FAILED (${failures.length}):`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}

console.log(`ticker edge/client parity passed (${compared} comparisons across ${games.length} cards: `
  + `${finals.length} postgame, ${liveCards.length} live, ${pregame.length} pregame, ${labelled} labelled)`);
