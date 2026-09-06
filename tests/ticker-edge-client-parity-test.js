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

/* ---- the scorebug, both implementations ----------------------------------
   The college card is the THIRD thing rendered twice (2026-09-05), and it is
   the biggest of the three: a header, two club rows and a status chip that
   deliberately drops the score. Lifted the same way, so this can only pass if
   the shipped client function agrees with the shipped worker byte for byte. */
const SCOREBUG_FNS = ['logoImg', 'isFootball', 'footballStatus', 'statusChip',
  'rankedName', 'bugRow', 'postgameDwell', 'insightStrip', 'scorebugCard'];

function clientArray(name) {
  const m = new RegExp('var ' + name + ' = (\\[[^\\]]*\\]);').exec(csrc);
  if (!m) throw new Error(`client array not found: ${name}`);
  return m[1];
}
function clientObject(name) {
  const m = new RegExp('var ' + name + ' = (\\{[^}]*\\});').exec(csrc);
  if (!m) throw new Error(`client object not found: ${name}`);
  return m[1];
}

const clientBug = new Function(
  ['INSIGHT_ROTATE_MS', 'POSTGAME_DWELL_MIN_MS', 'POSTGAME_DWELL_STEP_MS', 'POSTGAME_DWELL_STEPS']
    .map((n) => `var ${n} = ${constOf(n)};`).join('')
  + ESC
  + `var TICKER_ORD_Q = ${clientArray('TICKER_ORD_Q')};`
  + `var SCOREBUG_SPORTS = ${clientObject('SCOREBUG_SPORTS')};`
  + `var SPORT_LABEL = ${clientObject('SPORT_LABEL')};`
  + SCOREBUG_FNS.map(grab).join('')
  + ';return {scorebugCard:scorebugCard,statusChip:statusChip,SCOREBUG_SPORTS:SCOREBUG_SPORTS};'
)();

const edgeBug = new Function(
  `${wsrc.slice(0, cut)};return {scorebugCard,statusChip,SCOREBUG_SPORTS};`
)();

/* Every card state the college row can be in, plus the two shapes that only
   college has: a poll rank, and a school whose short form differs from its
   name. `day_label` is the carryover card (see mlbNavSlateService). */
const BUG_CARDS = [
  { sport: 'cfb', away: 'New Hampshire', home: 'Syracuse', away_abbr: 'UNH', home_abbr: 'SYR',
    away_logo: 'https://a.espncdn.com/x.png', home_logo: 'https://a.espncdn.com/y.png',
    away_score: 3, home_score: 66, status: 'final', status_detail: 'Final', period: 4,
    href: '/sportsbook/', insights: [{ category: 'cfb_headline', group: 'headline',
      text: 'Syracuse routs New Hampshire, 66-3' }], insight_mode: 'postgame', espn_event_id: '401700001' },
  { sport: 'cfb', away: 'Boise St', home: 'Oregon', home_rank: 2, away_abbr: 'BSU', home_abbr: 'ORE',
    away_score: 27, home_score: 34, status: 'final', status_detail: 'Final/OT', period: 5,
    insights: [], espn_event_id: '401700002' },
  { sport: 'cfb', away: 'Ohio', home: 'Nebraska', away_score: 21, home_score: 21,
    status: 'live', status_detail: '8:42 - 3rd', period: 3, clock: '8:42',
    insights: [{ category: 'live_state', group: 'context', text: 'Level at 21' }],
    insight_mode: 'live', espn_event_id: '401700003' },
  { sport: 'cfb', away: 'Portland St', home: 'San Diego St', status: 'scheduled',
    start_time_pt: '7:30 PM', espn_event_id: '401700004' },
  { sport: 'cfb', away: 'Miami', home: 'Stanford', away_rank: 7, away_score: 45, home_score: 6,
    status: 'final', status_detail: 'Final', period: 4, carryover: true, day_label: 'Sat',
    insights: [], espn_event_id: '401700005' },
  { sport: 'cfb', away: 'Tulane', home: 'Duke', status: 'postponed', espn_event_id: '401700006' }
];

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

/* THE SCOREBUG. Same diff, over the states the college row actually reaches. */
BUG_CARDS.forEach((g) => {
  compared += 1;
  const a = edgeBug.scorebugCard(g, 'cfb');
  const b = clientBug.scorebugCard(g, 'cfb');
  if (a !== b) {
    failures.push(`scorebugCard differs for ${g.away}@${g.home} (${g.status})
`
      + `    edge  : ${a.slice(0, 300)}
`
      + `    client: ${b.slice(0, 300)}`);
  }
  /* THE SCORE IS NEVER IN THE CHIP ON A SCOREBUG. That is the whole of Nima's
     2026-09-05 objection to "FINAL 3-66", and it is one boolean away from
     coming back. */
  if (typeof g.away_score === 'number'
      && new RegExp(`${g.away_score}\s*-\s*${g.home_score}`).test(
        /<span class="gb-hd">[\s\S]*?<\/span><\/span>/.exec(b) ? b.slice(b.indexOf('<span class="gb-hd">'), b.indexOf('<span class="gb-r')) : '')) {
    failures.push(`scorebug chip repeats the score for ${g.away}@${g.home}`);
  }
  /* Each score sits on its own club's row, in that club's own cell. */
  const cells = b.match(/<span class="gb-sc">([^<]*)<\/span>/g) || [];
  const want = (v) => (typeof v === 'number' ? `<span class="gb-sc">${v}</span>` : '<span class="gb-sc"></span>');
  if (cells.length !== 2 || cells[0] !== want(g.away_score) || cells[1] !== want(g.home_score)) {
    failures.push(`scorebug score cells wrong for ${g.away}@${g.home}: ${cells.join(' ')}`);
  }
  /* The winner is marked on the winning row and only on a completed game. */
  const rows = b.match(/<span class="gb-r[^"]*"/g) || [];
  const winIdx = rows.map((r, i) => (r.indexOf('is-win') > -1 ? i : -1)).filter((i) => i >= 0);
  const expected = (g.status === 'final' && typeof g.away_score === 'number'
    && g.away_score !== g.home_score) ? [g.away_score > g.home_score ? 0 : 1] : [];
  if (String(winIdx) !== String(expected)) {
    failures.push(`scorebug winner emphasis wrong for ${g.away}@${g.home}: rows ${winIdx} expected ${expected}`);
  }
});

/* THE ROW THAT OPTS IN. NFL must keep the one-line card until somebody decides
   otherwise, and this is the switch that decides it - in two files. */
if (String(Object.keys(edgeBug.SCOREBUG_SPORTS).sort())
    !== String(Object.keys(clientBug.SCOREBUG_SPORTS).sort())) {
  failures.push('SCOREBUG_SPORTS differs between the edge and the client');
}

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
