#!/usr/bin/env node
'use strict';

/**
 * POSTSEASON_MODE_20261001: series math, home field, rotation/rest, bullpen
 * workload, the official feed parser, and the promise that a regular season
 * game is simulated exactly as before (same seed, same output as HEAD).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const scriptPath = path.join(root, 'static', 'js', 'mlb-simulator.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function loadSimulator(src) {
  const el = () => ({
    id: '', disabled: false, value: '', textContent: '', innerHTML: '', className: '',
    attributes: {}, listeners: {},
    style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, removeChild() {}, querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const ctx = {
    window: { URL: { createObjectURL() { return 'blob:t'; }, revokeObjectURL() {} } },
    document: {
      readyState: 'complete',
      getElementById() { return el(); },
      querySelector() { return el(); },
      querySelectorAll() { return []; },
      addEventListener() {},
      createElement() { return el(); },
      body: { appendChild() {}, removeChild() {} },
    },
    console: { info() {}, log() {}, warn() {}, error() {} },
    Math, Number, Date, Promise, JSON, String, Array, Object,
    isNaN, parseFloat, parseInt, setTimeout, clearTimeout,
    Blob: class {},
    navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    fetch: () => Promise.reject(new Error('offline test')),
    CONFIG: { api: { baseUrl: '' } },
  };
  ctx.window.document = ctx.document;
  vm.runInNewContext(src, ctx);
  return ctx.window.TMRMlbSimulator;
}

const sim = loadSimulator(source);
const P = sim._postseason;
assert(P, 'postseason helpers are exposed for tests');

// Values from the vm realm carry its own Array/Object prototypes.
const j = (x) => JSON.parse(JSON.stringify(x));
const deq = (a, b, m) => assert.deepStrictEqual(j(a), j(b), m);
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log('ok - ' + name); }

/* ---- home field patterns ---- */
check('home field pattern per round', () => {
  const pat = (t) => Array.from({ length: P.ROUNDS[t].bestOf }, (_, i) => P.seriesHomeSeed(t, i + 1)).join('');
  assert.strictEqual(pat('F'), 'HHH', 'Wild Card: every game at the higher seed');
  assert.strictEqual(pat('D'), 'HHLLH', 'Division Series 2-2-1');
  assert.strictEqual(pat('L'), 'HHLLLHH', 'LCS 2-3-2');
  assert.strictEqual(pat('W'), 'HHLLLHH', 'World Series 2-3-2');
  assert.strictEqual(P.seriesHomeSeed('D', 6), null, 'no game 6 in a best of 5');
  deq(['F', 'D', 'L', 'W', 'R', 'S', ''].map(P.isPostseasonGameType), [true, true, true, true, false, false, false]);
});

/* ---- series Monte Carlo ---- */
function coin(p, seed) {
  let t = seed >>> 0;
  const rnd = () => { t += 0x6D2B79F5; let x = t; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  return () => (rnd() < p ? 'A' : 'B');
}
for (const bestOf of [3, 5, 7]) {
  check(`best of ${bestOf}: ends at the right win count, distribution sums to 1`, () => {
    const need = P.seriesWinsNeeded(bestOf);
    assert.strictEqual(need, (bestOf + 1) / 2);
    const flip = coin(0.55, 99 + bestOf);
    const perSeries = [];
    let cur = null;
    const mc = P.runSeriesMonteCarlo({
      bestOf, winsA: 0, winsB: 0, nSeries: 4000,
      onSeriesStart: () => { cur = { a: 0, b: 0 }; perSeries.push(cur); },
      playGame: (g, s, a, b) => {
        assert(a < need && b < need, 'no game is played after the series is decided');
        assert.strictEqual(g, a + b + 1, 'game number follows the games played');
        const w = flip(); if (w === 'A') cur.a += 1; else cur.b += 1; return w;
      },
    });
    perSeries.forEach((x) => {
      assert(Math.max(x.a, x.b) === need && Math.min(x.a, x.b) < need, 'exactly one side reaches the target');
    });
    const sumLen = Object.values(mc.lengthDist).reduce((a, b) => a + b, 0);
    assert(Math.abs(sumLen - 1) < 1e-9, 'length distribution sums to 1');
    const sumOutcome = Object.values(mc.outcomeDist.A).concat(Object.values(mc.outcomeDist.B)).reduce((a, b) => a + b, 0);
    assert(Math.abs(sumOutcome - 1) < 1e-9, 'team x length distribution sums to 1');
    assert(Math.abs(mc.pA + mc.pB - 1) < 1e-12);
    Object.keys(mc.lengthDist).map(Number).forEach((len) => assert(len >= need && len <= bestOf, 'length within [need, bestOf]'));
    // A 55% game edge compounds in a longer series.
    assert(mc.pA > 0.55, `55% per game favourite wins a best of ${bestOf} more than 55% (got ${mc.pA})`);
  });
}
check('series already in progress: tied 1-1 in a best of 3 always goes 3', () => {
  const mc = P.runSeriesMonteCarlo({ bestOf: 3, winsA: 1, winsB: 1, nSeries: 500, playGame: coin(0.5, 7) });
  deq(Object.keys(mc.lengthDist), ['3']);
  assert.strictEqual(mc.lengthDist['3'], 1);
});
check('decided series is reported, not simulated', () => {
  let calls = 0;
  const mc = P.runSeriesMonteCarlo({ bestOf: 5, winsA: 3, winsB: 1, nSeries: 100, playGame: () => { calls += 1; return 'A'; } });
  assert.strictEqual(calls, 0);
  assert.strictEqual(mc.pA, 1);
});
check('exact best of 3 probabilities at p = 0.6', () => {
  // closed form: P(A in 2) = .36, P(A in 3) = 2*.6*.4*.6 = .288
  const mc = P.runSeriesMonteCarlo({ bestOf: 3, nSeries: 200000, playGame: coin(0.6, 12345) });
  assert(Math.abs(mc.outcomeDist.A[2] - 0.36) < 0.006, 'A in 2 ~ .36');
  assert(Math.abs(mc.outcomeDist.A[3] - 0.288) < 0.006, 'A in 3 ~ .288');
  assert(Math.abs(mc.pA - 0.648) < 0.006, 'A wins ~ .648');
});

/* ---- rotation and rest ---- */
const arms = ['Ace', 'Two', 'Three', 'Four', 'Five'].map((n, i) => ({ name: n + ' Pitcher', mlbId: 1000 + i, quality: 120 - i * 5 }));
check('Division Series rotation: ace returns for Game 5 on full rest', () => {
  const plan = P.planSeriesRotation(arms, P.ROUNDS.D.days, 4, null);
  deq(plan.map((p) => p.pitcher.name.split(' ')[0]), ['Ace', 'Two', 'Three', 'Four', 'Ace']);
  assert(plan[4].restDays >= 4 && !plan[4].shortRest, 'Game 5 ace is on full rest');
});
check('LCS rotation: 7 games, top four, nobody on short rest', () => {
  const plan = P.planSeriesRotation(arms, P.ROUNDS.L.days, 4, null);
  deq(plan.map((p) => p.pitcher.name.split(' ')[0]), ['Ace', 'Two', 'Three', 'Four', 'Ace', 'Two', 'Three']);
  assert(plan.every((p) => !p.shortRest));
  assert(!plan.some((p) => p.pitcher.name.startsWith('Five')), 'fifth starter never used');
});
check('Wild Card rotation: top three on consecutive days', () => {
  const plan = P.planSeriesRotation(arms, P.ROUNDS.F.days, 3, null);
  deq(plan.map((p) => p.pitcher.name.split(' ')[0]), ['Ace', 'Two', 'Three']);
});
check('confirmed starter override is honoured and rested afterwards', () => {
  const plan = P.planSeriesRotation(arms, P.ROUNDS.D.days, 4, { 2: arms[0] });
  assert.strictEqual(plan[1].pitcher.name, 'Ace Pitcher');
  assert.strictEqual(plan[1].shortRest, true, 'ace on Game 1 and Game 2 is short rest');
});

/* ---- bullpen workload ---- */
check('reliever availability: heavy use or back to back sits, off day restores', () => {
  assert.strictEqual(P.relieverUnavailable([{ day: 0, outs: 6 }], 1), true, '6 outs yesterday');
  assert.strictEqual(P.relieverUnavailable([{ day: 0, outs: 3 }], 1), false, '3 outs yesterday is fine');
  assert.strictEqual(P.relieverUnavailable([{ day: 0, outs: 3 }, { day: 1, outs: 3 }], 2), true, 'two days in a row');
  assert.strictEqual(P.relieverUnavailable([{ day: 0, outs: 6 }], 2), false, 'an off day restores him');
  assert.strictEqual(P.relieverUnavailable([], 1), false);
});

/* ---- official feed parser ---- */
function feedGame(n, date, home, away, state, homeWin) {
  return {
    gamePk: 849840 + n, gameType: 'F', officialDate: date, seriesGameNumber: n, gamesInSeries: 3, seriesDescription: 'NL Wild Card Series', ifNecessary: 'N',
    status: { abstractGameState: state, detailedState: state === 'Final' ? 'Final' : 'Scheduled' },
    teams: { home: { team: { id: home }, isWinner: state === 'Final' ? homeWin : undefined }, away: { team: { id: away }, isWinner: state === 'Final' ? !homeWin : undefined } },
  };
}
const ATL = 144, PHI = 143;
const wcFeed = { series: { id: 'F_3', gameType: 'F' }, games: [
  feedGame(1, '2026-09-29', ATL, PHI, 'Final', true),
  feedGame(2, '2026-09-30', ATL, PHI, 'Final', false),
  feedGame(3, '2026-10-01', ATL, PHI, 'Live'),
] };
check('feed parser: Wild Card tied 1 to 1, Game 3 next', () => {
  const ctx = P.seriesContextFromFeed(wcFeed, '2026-10-01');
  assert.strictEqual(ctx.higher, 'ATL');
  assert.strictEqual(ctx.lower, 'PHI');
  deq(ctx.wins, { ATL: 1, PHI: 1 });
  assert.strictEqual(ctx.nextGameNumber, 3);
  assert.strictEqual(ctx.stateText, 'Series tied 1 to 1');
  deq(ctx.games.map((g) => g.day), [0, 1, 2]);
  const opts = P.postseasonGameOpts(ctx);
  assert.strictEqual(opts.elimination, true, 'Game 3 of a tied best of 3 is an elimination game');
  assert.strictEqual(opts.gameNumber, 3);
  assert(!/[–—]| - /.test(opts.label), 'no dashes in visitor copy: ' + opts.label);
  assert.strictEqual(P.findSeriesForTeams([wcFeed], 'PHI', 'ATL'), wcFeed, 'either orientation matches');
  assert.strictEqual(P.findSeriesForTeams([wcFeed], 'PHI', 'NYY'), null);
});
check('series state copy', () => {
  assert.strictEqual(P.seriesStateText(1, 0, 'PHI', 'ATL', 3), 'PHI leads 1 to 0');
  assert.strictEqual(P.seriesStateText(1, 2, 'NYY', 'CWS', 3), 'CWS wins 2 to 1');
  assert.strictEqual(P.seriesStateText(2, 2, 'A', 'B', 7), 'Series tied 2 to 2');
});

/* ---- postseason records are series records, not season records ---- */
check('statsapi postseason leagueRecord is ignored, regular season record is kept', () => {
  const team = { abbreviation: 'ATL' };
  const mk = (gameType) => [{ gameType, teams: { home: { team: { id: ATL }, leagueRecord: { wins: 2, losses: 0 } }, away: { team: { id: PHI }, leagueRecord: { wins: 0, losses: 2 } } } }];
  assert.strictEqual(P.todaysRecordForTeam(mk('F'), team), null);
  assert.strictEqual(P.todaysRecordForTeam(mk('D'), team), null);
  assert.strictEqual(P.todaysRecordForTeam(mk('R'), team).summary, '2-0');
  assert(/gameType=R,F,D,L,W/.test(P.recentLineupUrl(team)), 'recent lineup lookup includes playoff games');
});

/* ---- headshots ---- */
check('headshot markup: lazy, sized, initials fallback', () => {
  const h = P.headshotHtml(592450, 'Aaron Judge', 32);
  assert(/loading="lazy"/.test(h) && /decoding="async"/.test(h) && /width="32"/.test(h) && /height="32"/.test(h));
  assert(/img\.mlbstatic\.com\/mlb-photos\/image\/upload\/d_people:generic:headshot:67:current\.png\/w_120,q_auto:best\/v1\/people\/592450\/headshot\/67\/current/.test(h));
  assert(/>AJ</.test(h), 'initials underneath');
  const none = P.headshotHtml(null, 'Team SP', 32);
  assert(!/<img/.test(none) && /tmr-hs-noimg/.test(none), 'no id, no image request');
});

/* ---- engine: regular season unchanged, postseason deterministic ---- */
const teams = sim.localTeams.current;
const away = teams.find((t) => t.abbreviation === 'PHI');
const home = teams.find((t) => t.abbreviation === 'ATL');

check('regular season game is byte for byte the HEAD engine for the same seed', () => {
  let headSource;
  try { headSource = execFileSync('git', ['show', 'HEAD:static/js/mlb-simulator.js'], { cwd: root, maxBuffer: 1 << 26 }).toString('utf8'); } catch (e) { headSource = null; }
  if (!headSource || /POSTSEASON_MODE_20261001/.test(headSource)) { console.log('   (skipped: HEAD already carries postseason mode)'); return; }
  const old = loadSimulator(headSource);
  for (const seed of ['single-1', 'single-2', 'single-3']) {
    const a = sim.simulate(away, home, null, seed, false, 'clear');
    const b = old.simulate(old.localTeams.current.find((t) => t.abbreviation === 'PHI'), old.localTeams.current.find((t) => t.abbreviation === 'ATL'), null, seed, false, 'clear');
    assert.strictEqual(a.homeWin, b.homeWin, 'same win probability');
    assert.strictEqual(a.boxScore.away.runs, b.boxScore.away.runs);
    assert.strictEqual(a.boxScore.home.runs, b.boxScore.home.runs);
    deq(a.boxScore.away.innings, b.boxScore.away.innings);
    assert.strictEqual(a.postseason, null);
  }
});

check('postseason sides: shorter leash and a three arm middle pen flag', () => {
  const sp = { name: 'Mid Rotation', quality: 104, era: 3.9 };
  const ace = { name: 'Front Line', quality: 120, era: 2.6 };
  const reg = sim._engine.buildEventInputs(away, home, sp, ace, 4.4, 4.4, null, null);
  const ps = sim._engine.buildEventInputs(away, home, sp, ace, 4.4, 4.4, null, null, { round: 'DS' });
  const psShort = sim._engine.buildEventInputs(away, home, sp, ace, 4.4, 4.4, null, null, { round: 'DS', shortRest: { ATL: true } });
  assert.strictEqual(reg.awaySide.starterOuts - ps.awaySide.starterOuts, 2, 'mid rotation starter: two outs shorter');
  assert.strictEqual(reg.homeSide.starterOuts - ps.homeSide.starterOuts, 1, 'ace: one out shorter');
  assert.strictEqual(ps.homeSide.starterOuts - psShort.homeSide.starterOuts, 3, 'short rest: three more');
  assert.strictEqual(reg.homeSide.postseason, null);
  assert(ps.homeSide.postseason && ps.homeSide.postseason.round === 'DS');
  assert(ps.homeSide.starterOuts < reg.homeSide.starterOuts, 'postseason starter target is shorter');
});

check('engine series sim: deterministic, sums to 1, plan covers the remaining games', () => {
  const round = P.ROUNDS.D;
  const run = () => P.simulatePostseasonSeries(away, home, null, { round, higher: home, lower: away, winsHigher: 0, winsLower: 0, nSeries: 60, seed: 'test-seed' });
  const r1 = run();
  const r2 = run();
  deq(r1.mc.outcomeCounts, r2.mc.outcomeCounts, 'same seed, same series results');
  const sum = Object.values(r1.mc.lengthDist).reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1) < 1e-9);
  deq(Object.keys(r1.configs).map(Number), [1, 2, 3, 4, 5]);
  assert.strictEqual(r1.configs[1].home.abbreviation, 'ATL');
  assert.strictEqual(r1.configs[3].home.abbreviation, 'PHI');
  assert.strictEqual(r1.configs[5].home.abbreviation, 'ATL');
  assert.strictEqual(r1.mc.gameReached[1], 60);
  assert.strictEqual(r1.mc.gameReached[3], 60, 'a best of 5 always reaches game 3');
  // flags cleaned up
  Object.values(r1.configs).forEach((c) => c.inputs.homeSide.pitchers.forEach((p) => assert.strictEqual(p.capOverride, undefined)));
});

check('engine series sim from a series in progress: plan starts at the next game', () => {
  const r = P.simulatePostseasonSeries(away, home, null, { round: P.ROUNDS.D, higher: home, lower: away, winsHigher: 1, winsLower: 1, nSeries: 40, seed: 'mid' });
  deq(Object.keys(r.configs).map(Number), [3, 4, 5]);
  assert.strictEqual(r.configs[3].homeRest, null, 'next game starter has no invented rest count');
  Object.keys(r.mc.lengthDist).forEach((len) => assert(Number(len) >= 4, 'a 1 to 1 best of 5 lasts at least 4'));
  assert.strictEqual(r.mc.gameReached[4], 40);
});

console.log(`\n${passed} postseason checks passed`);
