#!/usr/bin/env node
'use strict';
/**
 * mlb-pitching-decisions-test.js -- MLB audit 2026-10-31.
 *
 *   node tests/mlb-pitching-decisions-test.js [games=300] [engine.js]
 *
 * 1. W/L follow Official Scoring Rule 9.17. Every seeded game is replayed from
 *    its own event log: the W is the winning club's last pitcher to face a batter
 *    before the go-ahead run that was never relinquished (its starter if it had
 *    not pitched yet), the L is the pitcher charged with that run. Starters with
 *    under 15 outs are the scorer's call (9.17(b)) and are skipped. Before the fix
 *    the W was the winning club's NEXT pitcher (21% of regulation games) and the
 *    extra-inning fallback named the second to last arm (69% wrong).
 * 2. The pitching table lists pitchers in the order they appeared (it was the
 *    bullpen ladder order, wrong whenever the closer worked before a depth arm).
 * 3. The setup man is the holds leader, not the smallest-sample ERA
 *    (TB: Kevin Kelly 33 holds over Cam Booser 13; MIL: Abner Uribe 23 holds,
 *    ERA tiebreak over JoJo Romero 23, not DL Hall 6).
 * 5. A walk-off ends when the winning run scores: no extra runs on a non-HR
 *    play, no out recorded after it (Rule 5.08).
 * 6. From the ninth on the closer is not sent out with his club trailing
 *    (18.0% of simulated team-games vs 3.6% real, statsapi play-by-play).
 * 4. Season stats are keyed on the last completed season from January to March.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const N = Number(process.argv[2] || 300);
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'static', 'js', 'mlb-simulator.js'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'mlb-sim-ws2026-tb-mil-inputs.json'), 'utf8'));

function el() {
  return { style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; }, appendChild() {}, removeChild() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, textContent: '', innerHTML: '', value: '', disabled: false };
}
function load(extraWindow) {
  const els = {};
  const context = {
    window: Object.assign({ URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} }, location: { search: '', href: '', pathname: '/mlb-simulator/' }, addEventListener() {} }, extraWindow || {}),
    document: { readyState: 'complete', getElementById(id) { return els[id] || (els[id] = el()); }, addEventListener() {}, createElement: el, querySelector() { return null; }, querySelectorAll() { return []; }, body: el() },
    console: { log() {}, warn() {}, error() {}, info() {} },
    Math, Number, Date, Promise, JSON, setTimeout, clearTimeout,
    Blob: class Blob {}, navigator: {},
    fetch: () => Promise.reject(new Error('offline')),
    CONFIG: { api: { baseUrl: 'http://offline' } },
  };
  context.window.document = context.document;
  context.window.TMR_MLB_WORKLOAD_V2 = true;
  context.window.TMR_MLB_STARTER_RESIDUAL = 0.010;
  const bbPath = path.join(root, 'static', 'data', 'mlb-battedball-2024.40b9b03b1878.json');
  if (fs.existsSync(bbPath)) context.window.TMR_MLB_BB_TABLE = JSON.parse(fs.readFileSync(bbPath, 'utf8'));
  vm.runInNewContext(script, context);
  const sim = context.window.TMRMlbSimulator;
  const lc = sim.state.liveContext;
  Object.assign(lc.teamRosters, fixture.teamRosters);
  lc.playerStats = Object.assign(lc.playerStats || {}, fixture.playerStats);
  lc.playerProfiles = Object.assign(lc.playerProfiles || {}, fixture.playerProfiles);
  lc.playerSplits = Object.assign(lc.playerSplits || {}, fixture.playerSplits);
  return sim;
}

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) failures++;
}
const strip = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '');

const sim = load();
const E = sim._engine;
const TB = sim.localTeams.current.find((t) => t.abbreviation === 'TB');
const MIL = sim.localTeams.current.find((t) => t.abbreviation === 'MIL');
const lc = sim.state.liveContext;

// ------------------------------------------------------------ 3. setup man
console.log('SETUP MAN');
{
  const r = sim.simulate(TB, MIL, lc, 'dec|staff', false, 'clear', { awayPitcher: fixture.awayPitcher, homePitcher: fixture.homePitcher, wpSamples: 1 });
  const role = (side, re) => (r.eventInputs[side].pitchers.find((p) => re.test(p.name)) || {}).role;
  const names = (side) => r.eventInputs[side].pitchers.map((p) => strip(p.name) + '/' + p.role).join(', ');
  check('TB setup man is Kevin Kelly (33 holds)', role('awaySide', /Kevin Kelly/) === 'SU', names('awaySide'));
  check('MIL setup man is Abner Uribe (23 holds, ERA tiebreak)', role('homeSide', /Abner Uribe/) === 'SU', names('homeSide'));
  check('closers unchanged (saves leaders Baker, Megill)', role('awaySide', /Bryan Baker/) === 'CL' && role('homeSide', /Megill/) === 'CL');
  const mids = (side) => r.eventInputs[side].pitchers.slice(0, r.eventInputs[side]._baseArms || 99).filter((p) => p.role === 'RP' || p.role === 'SU').length;
  check('regular-season ladder keeps four middle arms', mids('awaySide') === 4 && mids('homeSide') === 4, mids('awaySide') + '/' + mids('homeSide'));
}

// ------------------------------------------------- 1 + 2. decisions and order
console.log('DECISIONS (rule 9.17) AND PITCHING TABLE ORDER, ' + N + ' games');
const tally = { clTg: 0, clTrail: 0, wo: [0, 0], reg: [0, 0], extra: [0, 0], walkoff: [0, 0], L: [0, 0], skipped: 0, order: [0, 0] };
const examples = [];
for (let i = 0; i < N; i += 1) {
  const swap = i % 2 === 1;
  const r = sim.simulate(swap ? MIL : TB, swap ? TB : MIL, lc, 'dec|' + i, false, 'clear', swap ? { wpSamples: 1 } : { awayPitcher: fixture.awayPitcher, homePitcher: fixture.homePitcher, wpSamples: 1 });
  const bx = r.boxScore, ev = (bx.eventLog && bx.eventLog.events) || [];
  // order
  for (const side of ['away', 'home']) {
    const seen = [];
    ev.forEach((e) => { if (e.eventType !== 'SUB' && e.fieldingTeam === side && e.pitcherId && (e.eventType === 'PA' || e.outsAfter > e.outsBefore) && seen.indexOf(e.pitcherId) < 0) seen.push(e.pitcherId); });
    const rows = bx.players[side].pitchers.filter((p) => p.bf || p.outs).map((p) => p.name);
    const ok = rows.length === seen.length && rows.every((nm, k) => nm.indexOf(seen[k]) === 0);
    tally.order[0] += ok ? 1 : 0; tally.order[1] += 1;
    if (!ok && examples.length < 6) examples.push('order ' + i + ' ' + side + ': table ' + rows.map(strip).join(' > ') + ' | appeared ' + seen.join(' > '));
  }
  for (const side of ['away', 'home']) {
    tally.clTg += 1;
    const cl = bx.players[side].pitchers.find((p) => p.role === 'CL');
    if (!cl) continue;
    const first = ev.find((e) => e.eventType === 'PA' && e.fieldingTeam === side && cl.name.indexOf(e.pitcherId) === 0);
    if (!first) continue;
    const own = side === 'away' ? first.scoreBefore.away - first.scoreBefore.home : first.scoreBefore.home - first.scoreBefore.away;
    if (own < 0) tally.clTrail += 1;
  }
  if (bx.walkOff) {
    const scoring = ev.filter((e) => e.runsScored && e.runsScored.length);
    const lastPlay = scoring[scoring.length - 1] || {};
    const hr = lastPlay.result && lastPlay.result.code === 'HR';
    const awayOuts = bx.players.away.pitchers.reduce((t, p) => t + (p.outs || 0), 0);
    tally.wo[1] += 1;
    const okRuns = hr || bx.home.runs - bx.away.runs === 1;
    const okOuts = awayOuts <= 3 * bx.totalInnings - 1;
    tally.wo[0] += okRuns && okOuts ? 1 : 0;
    if (!(okRuns && okOuts) && examples.length < 6) examples.push('walk-off seed ' + i + ': ' + (lastPlay.result && lastPlay.result.detail) + ' final ' + bx.away.runs + '-' + bx.home.runs + ', away outs ' + awayOuts);
  }
  if (bx.gameStatus !== 'final' || bx.away.runs === bx.home.runs) continue;
  const winSide = bx.away.runs > bx.home.runs ? 'away' : 'home', loseSide = winSide === 'away' ? 'home' : 'away';
  const last = { away: null, home: null }; let offW = null, offL = null;
  for (const e of ev) {
    if (e.eventType === 'PA') last[e.fieldingTeam] = e.pitcherId;
    if (!e.scoreBefore || !e.scoreAfter) continue;
    const lb = winSide === 'away' ? e.scoreBefore.away - e.scoreBefore.home : e.scoreBefore.home - e.scoreBefore.away;
    const la = winSide === 'away' ? e.scoreAfter.away - e.scoreAfter.home : e.scoreAfter.home - e.scoreAfter.away;
    if (lb <= 0 && la > 0) {
      offW = last[winSide] || strip(bx.players[winSide].pitchers[0].name);
      const ga = (e.runsScored || [])[Math.max(0, -lb)];
      offL = (ga && ga.chargedPitcherId) || e.pitcherId;
    }
  }
  const margin = Math.abs(bx.away.runs - bx.home.runs);
  const ctxFor = (side) => ({ walkOff: bx.walkOff, extra: bx.totalInnings > 9, isHome: side === 'home', derivedWinPitcherName: bx.derivedWinPitcherName, derivedLosePitcherName: bx.derivedLosePitcherName });
  const wRows = bx.players[winSide].pitchers, lRows = bx.players[loseSide].pitchers;
  const W = strip((wRows[E.pitcherDecisions(wRows, true, margin, ctxFor(winSide)).labels.indexOf('W')] || {}).name);
  const L = strip((lRows[E.pitcherDecisions(lRows, false, margin, ctxFor(loseSide)).labels.indexOf('L')] || {}).name);
  const cat = bx.totalInnings > 9 ? 'extra' : (bx.walkOff ? 'walkoff' : 'reg');
  if (offW === strip(wRows[0].name) && Number(wRows[0].outs || 0) < 15) tally.skipped += 1;
  else {
    tally[cat][0] += W === offW ? 1 : 0; tally[cat][1] += 1;
    if (W !== offW && examples.length < 6) examples.push('W ' + cat + ' seed ' + i + ': engine ' + W + ', rule 9.17 ' + offW);
  }
  tally.L[0] += L === offL ? 1 : 0; tally.L[1] += 1;
  if (L !== offL && examples.length < 6) examples.push('L ' + cat + ' seed ' + i + ': engine ' + L + ', rule 9.17 ' + offL);
}
const f = (t) => t[0] + '/' + t[1];
check('winning pitcher, regulation', tally.reg[0] === tally.reg[1] && tally.reg[1] > 50, f(tally.reg));
check('winning pitcher, extra innings', tally.extra[0] === tally.extra[1] && tally.extra[1] > 5, f(tally.extra));
check('winning pitcher, walk-offs', tally.walkoff[0] === tally.walkoff[1], f(tally.walkoff));
check('losing pitcher = charged with the go-ahead run', tally.L[0] === tally.L[1], f(tally.L));
check('walk-offs end on the winning run (non-HR margin 1, no out after it)', tally.wo[0] === tally.wo[1] && tally.wo[1] > 5, f(tally.wo));
check('closer rarely enters trailing (real 2025-26: 3.6% of team-games; was 18%)', tally.clTrail / Math.max(1, tally.clTg) < 0.06, (100 * tally.clTrail / Math.max(1, tally.clTg)).toFixed(1) + '% of ' + tally.clTg);
check('pitching table in order of appearance', tally.order[0] === tally.order[1], f(tally.order));
console.log('  (short-starter games left to the scorer: ' + tally.skipped + ')');
examples.forEach((x) => console.log('    ' + x));

// ------------------------------------------------------------ 4. stats season
console.log('STATS SEASON');
{
  const sy = E.seasonYear;
  check('stats season helper exposed', typeof sy === 'function');
  if (typeof sy === 'function') {
    check('2027-01-15 reads the 2026 season', sy(new Date(Date.UTC(2027, 0, 15))) === '2026', sy(new Date(Date.UTC(2027, 0, 15))));
    check('2027-03-20 (pre Opening Day) reads 2026', sy(new Date(Date.UTC(2027, 2, 20))) === '2026');
    check('2027-04-02 reads 2027', sy(new Date(Date.UTC(2027, 3, 2))) === '2027');
    check('2026-10-31 reads 2026', sy(new Date(Date.UTC(2026, 9, 31))) === '2026');
  }
}

console.log(failures ? '\nFAIL (' + failures + ')' : '\nPASS');
process.exit(failures ? 1 : 0);
