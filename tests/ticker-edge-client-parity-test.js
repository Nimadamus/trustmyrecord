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

/* THE ROWS THAT OPT IN. College since 2026-09-05, NFL since 2026-09-14; this
   is the switch that decides it, in two files. */
if (!clientBug.SCOREBUG_SPORTS.nfl) failures.push('client no longer draws a started NFL game as a scorebug');
if (String(Object.keys(edgeBug.SCOREBUG_SPORTS).sort())
    !== String(Object.keys(clientBug.SCOREBUG_SPORTS).sort())) {
  failures.push('SCOREBUG_SPORTS differs between the edge and the client');
}

/* AN UPCOMING COLLEGE GAME IS A ONE-LINE CARD (Nima, 2026-09-14: Syracuse at
   Pitt "looks totally different ... doesn't look like the others"). Only a game
   with a score is a scorebug, and the rule lives in two files. */
{
  const edgeRow = new Function(`${wsrc.slice(0, cut)};return {espnTickerHtml};`)();
  const up = { sport: 'cfb', away: 'Syracuse', home: 'Pitt', status: 'scheduled', start_time_pt: 'Thu 4:30 PM',
    away_logo: 'https://a.espncdn.com/x.png', home_logo: 'https://a.espncdn.com/y.png', href: '/sportsbook/',
    insights: [{ category: 'line', text: 'Favored by 10.5', team_label: 'Pittsburgh Panthers' }], insight_mode: 'preview',
    espn_event_id: '401700009' };
  const done = Object.assign({}, up, { status: 'final', away_score: 21, home_score: 30, status_detail: 'Final', period: 4 });
  const upHtml = edgeRow.espnTickerHtml([up], 'cfb');
  const doneHtml = edgeRow.espnTickerHtml([done], 'cfb');
  if (/gm--bug/.test(upHtml) || !/class="gm gm--cfb" data-sport="cfb"/.test(upHtml)) {
    failures.push(`edge draws an upcoming college game as a scorebug: ${upHtml.slice(0, 160)}`);
  }
  if (!/gm--bug/.test(doneHtml)) failures.push('edge no longer draws a finished college game as a scorebug');
  if (csrc.indexOf("if (SCOREBUG_SPORTS[key] && g.status !== 'scheduled')") === -1) {
    failures.push('client renderTicker does not route an upcoming college game to the one-line card');
  }
}

/* ONE STRIP, EVERY SPORT, ONE ORDER (Nima, 2026-09-14: the live Broncos at
   Chiefs game sat on page nine of ten behind eight MLB cards). The whole lane
   is rendered through both implementations over a mixed slate and diffed, and
   the order itself is held to the priority rule. */
{
  const LANE_FNS = ['logoImg', 'isFootball', 'footballStatus', 'statusChip', 'rankedName', 'nameSpan',
    'bugRow', 'postgameDwell', 'insightStrip', 'pitcherLine', 'scorebugCard',
    'mlbCardHtml', 'espnCardHtml', 'tickerTier', 'tickerOrder'];
  const clientLane = new Function(
    ['INSIGHT_ROTATE_MS', 'POSTGAME_DWELL_MIN_MS', 'POSTGAME_DWELL_STEP_MS', 'POSTGAME_DWELL_STEPS']
      .map((n) => `var ${n} = ${constOf(n)};`).join('')
    + ESC
    + `var TICKER_ORD_Q = ${clientArray('TICKER_ORD_Q')};`
    + `var SCOREBUG_SPORTS = ${clientObject('SCOREBUG_SPORTS')};`
    + `var SPORT_LABEL = ${clientObject('SPORT_LABEL')};`
    + `var TICKER_SPORT_ORDER = ${clientArray('TICKER_SPORT_ORDER')};`
    + LANE_FNS.map(grab).join('')
    + ';return {tickerOrder:tickerOrder,mlbCardHtml:mlbCardHtml,espnCardHtml:espnCardHtml};'
  )();
  const edgeLane = new Function(`${wsrc.slice(0, cut)};return {slateTickerHtml, tickerOrder};`)();

  const nflLive = { sport: 'nfl', id: 'espn:401872931', espn_event_id: '401872931', away: 'DEN', home: 'KC',
    away_team_name: 'Denver Broncos', home_team_name: 'Kansas City Chiefs',
    away_logo: 'https://a.espncdn.com/den.png', home_logo: 'https://a.espncdn.com/kc.png',
    status: 'live', status_label: 'LIVE', status_detail: '14:39 - 4th', period: 4, clock: '14:39',
    possession: 'home', away_score: 10, home_score: 31, href: '/sportsbook/',
    insights: [
      { category: 'breaking_td_pass', text: 'Caught a 2 yard touchdown pass from Patrick Mahomes with 14:39 left in the game',
        team_label: 'Kenneth Walker III', breaking: true, event_at: '2026-09-15T02:38:58.000Z' },
      { category: 'live_state', group: 'context', text: 'Lead by 21 in the 4th quarter', team_label: 'Kansas City Chiefs' }
    ],
    insight_mode: 'live' };
  const nflFinal = Object.assign({}, nflLive, { id: 'espn:1', espn_event_id: '1', away: 'LV', home: 'LAC',
    status: 'final', status_detail: 'Final', period: 4, clock: null, possession: 'away', away_score: 20, home_score: 17,
    insight_mode: 'postgame' });
  const nflNext = { sport: 'nfl', id: 'espn:2', away: 'BUF', home: 'MIA', status: 'scheduled',
    start_time_pt: 'Thu 5:15 PM', lookahead: true, href: '/sportsbook/' };
  const mixed = Object.assign({}, slate, { nfl_games: [nflFinal, nflLive, nflNext], nba_games: [], nhl_games: [],
    cfb_games: [BUG_CARDS[2], BUG_CARDS[3]] });

  const rows = [
    { key: 'mlb', games: mixed.games || [] }, { key: 'nfl', games: mixed.nfl_games },
    { key: 'nba', games: [] }, { key: 'nhl', games: [] }, { key: 'cfb', games: mixed.cfb_games }
  ];
  const order = clientLane.tickerOrder(rows);
  const clientHtml = order.map((e) => (e.key === 'mlb' ? clientLane.mlbCardHtml(e.g) : clientLane.espnCardHtml(e.g, e.key))).join('');
  const edgeHtml = edgeLane.slateTickerHtml(mixed);
  compared += 1;
  if (clientHtml !== edgeHtml) {
    let at = 0;
    while (at < clientHtml.length && clientHtml[at] === edgeHtml[at]) at += 1;
    failures.push(`whole lane differs between edge and client at byte ${at}
`
      + `    edge  : ${edgeHtml.slice(Math.max(0, at - 80), at + 160)}
`
      + `    client: ${clientHtml.slice(Math.max(0, at - 80), at + 160)}`);
  }
  const edgeOrder = edgeLane.tickerOrder(rows).map((e) => e.key + ':' + (e.g.away || '')).join(',');
  if (edgeOrder !== order.map((e) => e.key + ':' + (e.g.away || '')).join(',')) {
    failures.push('tickerOrder differs between edge and client');
  }

  /* League-complete order: each sport is a contiguous block in TICKER_SPORT_ORDER;
     inside a sport, live / delayed / final / scheduled / lookahead. */
  const tier = (g) => (g.lookahead || g.carryover) ? 4 : g.status === 'live' ? 0
    : (g.status === 'delayed' || g.status === 'suspended') ? 1 : g.status === 'final' ? 2 : g.status === 'scheduled' ? 3 : 4;
  const sportBlocks = [];
  order.forEach((e) => {
    if (!sportBlocks.length || sportBlocks[sportBlocks.length - 1].key !== e.key) {
      sportBlocks.push({ key: e.key, games: [e] });
    } else {
      sportBlocks[sportBlocks.length - 1].games.push(e);
    }
  });
  const sportRank = (k) => {
    const i = ['nfl', 'mlb', 'nba', 'nhl', 'cfb'].indexOf(k);
    return i < 0 ? 99 : i;
  };
  for (let i = 1; i < sportBlocks.length; i++) {
    if (sportRank(sportBlocks[i].key) < sportRank(sportBlocks[i - 1].key)) {
      failures.push(`sport order broken: ${sportBlocks[i].key} after ${sportBlocks[i - 1].key}`);
      break;
    }
  }
  sportBlocks.forEach((b) => {
    for (let i = 1; i < b.games.length; i++) {
      if (tier(b.games[i].g) < tier(b.games[i - 1].g)) {
        failures.push(`priority broken inside ${b.key}: ${b.games[i].g.away} (${b.games[i].g.status}) after ${b.games[i - 1].g.away} (${b.games[i - 1].g.status})`);
        break;
      }
    }
  });
  if (!order.length || order[0].g !== nflLive) {
    failures.push(`a live NFL game does not lead its league: first is ${order[0] && order[0].key}`);
  }
  const nflLast = order.filter((e) => e.key === 'nfl').pop();
  if (!nflLast || nflLast.g !== nflNext) failures.push('a lookahead NFL fixture is not at the back of the NFL block');
  if (order.length !== rows.reduce((n, r) => n + r.games.length, 0)) failures.push('tickerOrder dropped or duplicated a card');

  /* The live NFL card is a scorebug with the quarter, the clock, both scores and
     the ball on the home side; the final carries no possession marker. */
  const liveHtml = clientLane.espnCardHtml(nflLive, 'nfl');
  if (!/gm--nfl gm--bug/.test(liveHtml)) failures.push('live NFL card is not a scorebug');
  if (!/<span class="gb-lbl">NFL<\/span>/.test(liveHtml)) failures.push('live NFL scorebug does not name its league');
  if (!/14:39/.test(liveHtml) || !/4th Quarter|4Q/.test(liveHtml)) failures.push('live NFL scorebug lacks the clock or quarter');
  const bugRows = liveHtml.match(/<span class="gb-r[\s\S]*?<span class="gb-sc">[^<]*<\/span><\/span>/g) || [];
  if (bugRows.length !== 2 || /gb-pos/.test(bugRows[0]) || !/gb-pos/.test(bugRows[1])) {
    failures.push('possession marker is not on the home row only');
  }
  if (/gb-pos/.test(clientLane.espnCardHtml(nflFinal, 'nfl'))) failures.push('a final NFL game draws a possession marker');
  /* A BREAKING MOMENT carries its time and an empty age chip, in both files,
     and an ordinary line carries neither. */
  if (!/<span class="gm-in-l is-on"[^>]*data-brk="2026-09-15T02:38:58.000Z"[^>]*><i class="ts" aria-hidden="true"><\/i><em class="gm-ago"><\/em><b>Kenneth Walker III: /.test(liveHtml)) {
    failures.push(`breaking line markup is wrong: ${liveHtml.slice(liveHtml.indexOf('gm-in-l'), liveHtml.indexOf('gm-in-l') + 260)}`);
  }
  if ((liveHtml.match(/data-brk=/g) || []).length !== 1 || (liveHtml.match(/gm-ago/g) || []).length !== 1) {
    failures.push('an ordinary insight line carries breaking markup');
  }
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
