#!/usr/bin/env node
/*
 * PITCHING_MANAGEMENT_20261023 -- regression and stress suite for the manager
 * AI: starter hooks, bullpen roles, closer usage, re-entry legality and the
 * reasons recorded for every pitching change.
 *
 * Built from the report on World Series Game 1 (Rays at Brewers, 2026-10-23):
 * Jacob Misiorowski lifted after 4 2/3 IP, 1 H, 1 ER, 62 pitches, and Trevor
 * Megill (Milwaukee's closer) used for 2 2/3 IP and 41 pitches.
 *
 * Inputs are the real statsapi rosters, season lines, profiles and splits for
 * both clubs captured that day (tests/fixtures/mlb-sim-ws2026-tb-mil-inputs.json).
 * Nothing about either player's OUTCOME is in the fixture or in the engine; the
 * suite measures what the engine decides from those inputs over seeded games
 * and compares the distributions to real MLB usage measured from statsapi
 * boxscores (every 2022-2025 postseason game, 600 spread 2025 regular season
 * games; see the BENCH table).
 *
 * Usage: node tests/mlb-simulator-pitching-management-test.js [gamesPerMode]
 * Exit 0 = every check passes.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const N = Number(process.argv[2] || 1500);
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'static', 'js', 'mlb-simulator.js'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'mlb-sim-ws2026-tb-mil-inputs.json'), 'utf8'));

// Real usage, measured from statsapi boxscores (closer = the club's season
// saves leader; a "dominant start" = 12+ outs, 1 ER or fewer, 3 hits or fewer).
const BENCH = {
  post: { clFourPlus: 31.5, clSevenPlus: 1.2, cl35: 2.4, domEarlyHook: 30.6, pitchersPerGame: 5.03, spPitchP50: 82 },
  reg: { clFourPlus: 10.0, clSevenPlus: 0.0, cl35: 1.5, domEarlyHook: 19.8, pitchersPerGame: 4.26, spPitchP50: 88 },
};

function el() {
  return { style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; }, appendChild() {}, removeChild() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, textContent: '', innerHTML: '', value: '', disabled: false };
}
let testWindow = null;
function load() {
  const els = {};
  const context = {
    window: { URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} }, location: { search: '', href: '', pathname: '/mlb-simulator/' }, addEventListener() {} },
    document: { readyState: 'complete', getElementById(id) { return els[id] || (els[id] = el()); }, addEventListener() {}, createElement: el, querySelector() { return null; }, querySelectorAll() { return []; }, body: el() },
    console: { log() {}, warn() {}, error() {}, info() {} },
    Math, Number, Date, Promise, JSON, setTimeout, clearTimeout,
    Blob: class Blob {}, navigator: {},
    fetch: () => Promise.reject(new Error('offline')),
    CONFIG: { api: { baseUrl: 'http://offline' } },
  };
  context.window.document = context.document;
  // Exactly what mlb-simulator/index.html ships: these three globals.
  context.window.TMR_MLB_WORKLOAD_V2 = true;
  context.window.TMR_MLB_STARTER_RESIDUAL = 0.010;
  const bbPath = path.join(root, 'static', 'data', 'mlb-battedball-2024.40b9b03b1878.json');
  if (fs.existsSync(bbPath)) context.window.TMR_MLB_BB_TABLE = JSON.parse(fs.readFileSync(bbPath, 'utf8'));
  vm.runInNewContext(script, context);
  testWindow = context.window;
  const sim = context.window.TMRMlbSimulator;
  const lc = sim.state.liveContext;
  Object.assign(lc.teamRosters, fixture.teamRosters);
  lc.playerStats = Object.assign(lc.playerStats || {}, fixture.playerStats);
  lc.playerProfiles = Object.assign(lc.playerProfiles || {}, fixture.playerProfiles);
  lc.playerSplits = Object.assign(lc.playerSplits || {}, fixture.playerSplits);
  return sim;
}

const sim = load();
const TB = sim.localTeams.current.find((t) => t.abbreviation === 'TB');
const MIL = sim.localTeams.current.find((t) => t.abbreviation === 'MIL');
const ctx = sim.state.liveContext;
const E = sim._engine;
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) failures++;
}
function run(i, opts) {
  return sim.simulate(TB, MIL, ctx, 'pm|' + opts.tag + '|' + i, false, 'clear', Object.assign({ awayPitcher: fixture.awayPitcher, homePitcher: fixture.homePitcher, wpSamples: 1 }, opts.ps ? { postseason: fixture.postseason } : {}));
}

// ---------------------------------------------------------------- the ladder
console.log('STAFF (from the real roster inputs)');
{
  const r = run(0, { tag: 'staff', ps: true });
  const staff = r.eventInputs.homeSide.pitchers;
  const names = staff.map((p) => p.name + '/' + p.role).join(', ');
  check('Milwaukee closer is Trevor Megill (saves leader)', staff.some((p) => /Megill/.test(p.name) && p.role === 'CL'), names);
  check('postseason ladder carries at least five relievers', staff.filter((p) => p.role !== 'SP').length >= 5, names);
  check('starter is Jacob Misiorowski', /Misiorowski/.test(staff[0].name));
}

// ----------------------------------------------------- deterministic unit cases
console.log('UNIT (evActivePitcher / evDefPitcher decisions, fixed states)');
function freshSide(ps) {
  const r = run(0, { tag: 'unit', ps });
  const side = r.eventInputs.homeSide;
  // one engine game resets the per-game state; then overwrite what we test
  E.evSimGame(r.eventInputs.awaySide, side, () => 0.5, null, null, null);
  side.pitchers.length = side._baseArms;
  side.pitchers.forEach((p) => { p.acc = { outs: 0, h: 0, bb: 0, hbp: 0, r: 0, er: 0, bf: 0, pitches: 0, so: 0, hr: 0 }; p.removed = false; p._enterMargin = undefined; });
  side.minArmIdx = 0; side._activePitcher = side.pitchers[0]; side._halfEndPitcher = side.pitchers[0];
  side.depthArm = null; side.depthArmIdx = -1; side._reserveNext = 0; side._genericDepthMade = false; side.posPitcher = null;
  return side;
}
function setSp(side, acc, plan, ride) {
  Object.assign(side.pitchers[0].acc, acc);
  side.starterOutsGame = plan; side._spPlanOuts = plan; side._spRide = ride;
}
{
  // The reported line: 1 H, 0 BB, 1 R, ~4.4 pitches an out. Plan drawn at 14 outs.
  let s = freshSide(true);
  setSp(s, { outs: 15, bf: 16, h: 1, bb: 0, r: 1, er: 1, pitches: 66, so: 7 }, 14, true);
  let p = E.evActivePitcher(s, 15, false, 2, 1, null);
  check('cruising starter past his plan is sent back out (ride night)', p === s.pitchers[0], 'got ' + p.name + ', new plan ' + s.starterOutsGame);
  s = freshSide(true);
  setSp(s, { outs: 15, bf: 16, h: 1, bb: 0, r: 1, er: 1, pitches: 66, so: 7 }, 14, false);
  p = E.evActivePitcher(s, 15, false, 2, 1, null);
  check('same line on a quick-hook night goes to the pen (variation kept)', p !== s.pitchers[0], 'got ' + p.name);
  s = freshSide(true);
  setSp(s, { outs: 15, bf: 22, h: 4, bb: 3, r: 2, er: 2, pitches: 88, so: 5 }, 14, true);
  p = E.evActivePitcher(s, 15, false, 2, 1, null);
  check('laboring starter (88 pitches, 7 on) is not extended', p !== s.pitchers[0], 'got ' + p.name);
  s = freshSide(true);
  setSp(s, { outs: 15, bf: 16, h: 1, bb: 0, r: 0, er: 0, pitches: 66, so: 7 }, 14, true);
  for (let outs = 15; outs <= 27; outs += 3) { s.pitchers[0].acc.outs = outs; s.pitchers[0].acc.pitches = 66 + (outs - 15) * 4; E.evActivePitcher(s, outs, false, 2, 0, null); }
  check('extension is bounded at two innings past the plan', s.starterOutsGame <= 14 + 6 + 3, 'plan now ' + s.starterOutsGame);
}
{
  // Megill: a 7th-inning boundary with the setup man spent. Closer not allowed.
  const s = freshSide(true);
  setSp(s, { outs: 14, bf: 17, h: 1, bb: 0, r: 1, er: 1, pitches: 62 }, 14, true);
  s.pitchers[0].removed = true;
  const cl = s.pitchers.find((p) => p.role === 'CL');
  s.pitchers.forEach((p) => { if (p.role !== 'SP' && p.role !== 'CL') { p.acc.outs = 2; p.acc.bf = 3; p.removed = true; } });
  const su = s.pitchers.find((p) => p.role === 'SU'); su.removed = false; su.acc.outs = 1; su.acc.bf = 3;
  s.minArmIdx = s.pitchers.indexOf(cl); s._activePitcher = su; s._halfEndPitcher = su;
  const p = E.evDefPitcher(s, 21 - 3, 1, 0, 6, null); // start of the 7th, up one
  check('closer is not brought in to start the 7th of a non-elimination game', p !== cl, 'got ' + p.name + '/' + p.role);
  s._activePitcher = p; s._halfEndPitcher = p;
  p.acc.outs = 6; p.acc.pitches = 34; // that arm is spent after two innings
  const p9 = E.evDefPitcher(s, 24, 1, 0, 8, null);
  if (process.argv.includes('--debug')) console.log('DEBUG', s.pitchers.map((x) => x.name + '/' + x.role + ' rm=' + !!x.removed + ' o=' + x.acc.outs + ' pc=' + x.acc.pitches).join(' | '), 'floor', s.minArmIdx, 'depthIdx', s.depthArmIdx);
  check('closer takes the 9th with a one-run lead', p9 === cl, 'got ' + p9.name);
  cl.acc.outs = 4; cl.acc.pitches = 18; s._activePitcher = cl; s._halfEndPitcher = cl;
  const p11 = E.evDefPitcher(s, 30, 3, 3, 10, null);
  check('closer with four outs is not sent out for a third inning', p11 !== cl, 'got ' + p11.name);
}

// ---------------------------------------------- run-scoring legality helper
// RUN_SCORING_LEGALITY_20261024: every run must be a runner who reached base in
// that half-inning by a recorded event (hit, walk, hit by pitch, error, fielder's
// choice, interference: any PA that leaves the batter on base or scores him) or
// the extra-inning placed runner, and no runner may score twice. Runs above hits
// are legal (walks, errors, sac flies, wild pitches score runners without a hit);
// a run from a runner who never reached is not, and a runner who scores must
// reach again before he can score again.
function auditRunScoring(events) {
  const bad = [];
  let key = null, onBase = new Set(), scored = new Set(), half = 0;
  events.forEach((e) => {
    const k = e.inning + e.half;
    if (k !== key) { key = k; onBase = new Set(); scored = new Set(); half++; }
    if (e.eventType === 'PLACED_RUNNER') { (e.baseStateAfter || []).forEach((r) => { if (r !== null && r !== undefined) onBase.add(String(r)); }); }
    if (e.eventType === 'PA' && e.batterSlot !== undefined) {
      const b = String(e.batterSlot);
      const reached = (e.baseStateAfter || []).some((r) => r !== null && String(r) === b) || (e.runsScored || []).some((r) => String(r.runnerSlot) === b);
      if (reached) onBase.add(b);
    }
    (e.baseStateBefore || []).forEach((r) => { if (r !== null && r !== undefined) onBase.add(String(r)); });
    (e.runsScored || []).forEach((r) => {
      const id = String(r.runnerSlot) + '@' + half;
      if (!onBase.has(String(r.runnerSlot))) bad.push(k + ' run by slot ' + r.runnerSlot + ' who never reached (' + (e.result && e.result.code) + ')');
      // A slot can legally score twice in one half when the order bats around;
      // it must have reached again in between, which the onBase set enforces.
      onBase.delete(String(r.runnerSlot));
    });
  });
  return bad;
}

// The auditor must catch what it claims to: a run by a runner who never reached.
{
  const ok = auditRunScoring([
    { eventType: 'PA', inning: 1, half: 'top', batterSlot: 0, baseStateBefore: [null, null, null], baseStateAfter: [0, null, null], runsScored: [] },
    { eventType: 'PA', inning: 1, half: 'top', batterSlot: 1, baseStateBefore: [0, null, null], baseStateAfter: [null, null, null], runsScored: [{ runnerSlot: 0 }, { runnerSlot: 1 }] }]);
  const bad = auditRunScoring([
    { eventType: 'PA', inning: 1, half: 'top', batterSlot: 1, baseStateBefore: [null, null, null], baseStateAfter: [null, null, null], runsScored: [{ runnerSlot: 4 }] }]);
  if (ok.length !== 0 || bad.length !== 1) { console.log('  FAIL run-scoring auditor self-test', JSON.stringify({ ok, bad })); process.exit(1); }
}

// ------------------------------------------------- explanation audit helper
// Every number a pitching-change reason quotes must equal the game state at
// that moment, recomputed independently from the event log: pitch counts,
// runs, earned runs, hits allowed, and the score the leverage note names.
const HITS = { '1B': 1, '2B': 1, '3B': 1, HR: 1 };
function auditReasons(events, fld) {
  const bad = [];
  const st = {}; // pitcher -> running line from the log
  const line = (n) => (st[n] = st[n] || { pitches: 0, h: 0, runs: 0, er: 0 });
  const strip = (n) => String(n || '').replace(/\s*\((LHP|RHP)\)$/, '');
  events.forEach((e) => {
    if (e.fieldingTeam !== fld) return;
    if (e.eventType === 'PA') {
      const L = line(strip(e.pitcherId));
      L.pitches += (e.pitches || []).length;
      if (e.result && HITS[e.result.code]) L.h++;
    }
    (e.runsScored || []).forEach((r) => {
      const on = line(strip(e.pitcherId)); on.runs++;
      const ch = line(strip(r.chargedPitcherId)); if (r.earned) ch.er++;
    });
    if (e.eventType !== 'SUB' || !e.substitutionData || e.substitutionData.role !== 'P') return;
    const why = String(e.substitutionData.reason || ''), L = line(strip(e.substitutionData.out));
    let m;
    if ((m = /(?:pitch count|pitch limit|workload reached) \((\d+)/.exec(why)) && Number(m[1]) !== L.pitches) bad.push(why + ' | log pitches ' + L.pitches);
    if ((m = /allowing (\d+) earned runs/.exec(why)) && Number(m[1]) !== L.er) bad.push(why + ' | log ER ' + L.er);
    if ((m = /allowed (\d+) hits|allowing (\d+) hits/.exec(why)) && Number(m[1] || m[2]) > L.h) bad.push(why + ' | log hits ' + L.h);
    if ((m = /allowed (\d+) runs|allowing (\d+) runs/.exec(why)) && Number(m[1] || m[2]) > L.runs) bad.push(why + ' | log runs on his watch ' + L.runs);
    if (/leverage|four-out save/.test(why) && e.scoreBefore) {
      const lead = fld === 'home' ? e.scoreBefore.home - e.scoreBefore.away : e.scoreBefore.away - e.scoreBefore.home;
      const said = /tie game/.test(why) ? 0 : (m = /(\d+)-run lead/.exec(why)) ? Number(m[1]) : (m = /trailing by (\d+)/.exec(why)) ? -Number(m[1]) : null;
      if (said !== lead) bad.push(why + ' | log lead ' + lead);
    }
  });
  return bad;
}

// ------------------------------------------------------- seeded game sweeps
function sweep(ps) {
  const m = { games: 0, teamGames: 0, sp: [], cl: [], clEarly: 0, reentry: 0, posClose: 0, generic: 0, pitchers: 0, subs: 0, genericReason: 0, spInfo: [], recon: 0, reasonBad: [] };
  for (let i = 0; i < N; i++) {
    const r = run(i, { tag: ps ? 'ps' : 'rs', ps });
    const bx = r.boxScore; m.games++;
    const events = (bx.eventLog && bx.eventLog.events) || [];
    if (!bx.reconciliation || !bx.reconciliation.clean) m.recon++;
    m.runBad = (m.runBad || []).concat(auditRunScoring(events));
    ['away', 'home'].forEach((k) => { const ex = bx[k].runs - bx[k].hits; m.maxRunsOverHits = Math.max(m.maxRunsOverHits || 0, ex); });
    ['away', 'home'].forEach((k) => {
      m.reasonBad.push(...auditReasons(events, k));
      const rows = bx.players[k].pitchers; m.teamGames++; m.pitchers += rows.length;
      const margin = Math.abs(bx.away.runs - bx.home.runs);
      if (margin <= 4 && rows.some((p) => p.role === 'POS')) m.posClose++;
      if (rows.some((p) => /emergency reliever/.test(p.name))) m.generic++;
      m.sp.push(rows[0]);
      rows.filter((p) => p.role === 'CL').forEach((p) => m.cl.push(p));
      // re-entry: in this club's fielding PAs, no pitcher returns after another pitched
      const fld = k;
      const seq = [];
      events.forEach((e) => { if (e.eventType === 'PA' && e.fieldingTeam === fld && e.pitcherId && seq[seq.length - 1] !== e.pitcherId) seq.push(e.pitcherId); });
      if (new Set(seq).size !== seq.length) m.reentry++;
      events.forEach((e) => {
        if (e.eventType !== 'SUB' || !e.substitutionData || e.substitutionData.role !== 'P' || e.fieldingTeam !== fld) return;
        m.subs++;
        if (!e.substitutionData.reason || e.substitutionData.reason === 'pitching change') m.genericReason++;
        const inRow = rows.find((p) => p.role === 'CL' && p.name.replace(/\s*\((LHP|RHP)\)$/, '') === String(e.substitutionData.in).replace(/\s*\((LHP|RHP)\)$/, ''));
        if (inRow && e.inning < 8) m.clEarly++;
      });
    });
  }
  return m;
}
const pct = (a, b) => (100 * a / (b || 1));
const q = (arr, p) => { const s = arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function report(label, m, B, lim) {
  console.log(label + ' (' + m.games + ' seeded games)');
  const cl4 = pct(m.cl.filter((p) => p.outs >= 4).length, m.cl.length);
  const cl7 = pct(m.cl.filter((p) => p.outs >= 7).length, m.cl.length);
  const cl35 = pct(m.cl.filter((p) => p.pitches >= 35).length, m.cl.length);
  const dom = m.sp.filter((p) => p.outs >= 12 && p.er <= 1 && p.h <= 3);
  const domHook = pct(dom.filter((p) => p.outs < 18 && p.pitches < 80).length, dom.length);
  const ppg = m.pitchers / m.teamGames;
  const p50 = q(m.sp.map((p) => p.pitches), 0.5);
  const t = (name, v, real, ok) => check(name, ok, 'sim ' + v.toFixed(2) + ' vs real ' + real);
  t('closer outings of 7+ outs (%)', cl7, B.clSevenPlus, cl7 <= lim.cl7);
  t('closer outings of 35+ pitches (%)', cl35, B.cl35, cl35 <= lim.cl35);
  t('closer outings of 4+ outs (%)', cl4, B.clFourPlus, cl4 >= lim.cl4[0] && cl4 <= lim.cl4[1]);
  t('dominant starts lifted before 6 IP under 80 pitches (%)', domHook, B.domEarlyHook, domHook >= lim.dom[0] && domHook <= lim.dom[1]);
  t('pitchers used per team-game', ppg, B.pitchersPerGame, Math.abs(ppg - B.pitchersPerGame) <= lim.ppg);
  t('starter pitch count p50', p50, B.spPitchP50, Math.abs(p50 - B.spPitchP50) <= lim.p50);
  check('closer entered before the 8th (% of closer outings)', pct(m.clEarly, m.cl.length) <= lim.clEarly, pct(m.clEarly, m.cl.length).toFixed(2) + '%');
  check('position player pitched in a game decided by 4 or fewer (% team-games)', pct(m.posClose, m.teamGames) <= 0.5, pct(m.posClose, m.teamGames).toFixed(2) + '%');
  check('no pitcher re-entered after being replaced', m.reentry === 0, m.reentry + ' team-games');
  check('every pitching change records the engine reason', m.genericReason === 0, m.genericReason + ' of ' + m.subs + ' changes');
  check('every reason matches the game state in the event log', m.reasonBad.length === 0, m.reasonBad.length + ' mismatches' + (m.reasonBad[0] ? ': ' + m.reasonBad[0] : ''));
  check('box score reconciles with the engine in every game', m.recon === 0, m.recon + ' games');
  check('every run was scored by a runner who legally reached base', (m.runBad || []).length === 0, (m.runBad || []).length + (m.runBad && m.runBad[0] ? ': ' + m.runBad[0] : '') + ' | max runs over hits ' + m.maxRunsOverHits);
}
report('POSTSEASON (World Series Game 1)', sweep(true), BENCH.post, { cl7: 0.6, cl35: 4.0, cl4: [12, 40], dom: [18, 40], ppg: 0.45, p50: 6, clEarly: 1.5 });
report('REGULAR SEASON (same clubs)', sweep(false), BENCH.reg, { cl7: 0.6, cl35: 3.0, cl4: [4, 16], dom: [10, 30], ppg: 0.45, p50: 6, clEarly: 1.5 });

// ------------------------------------- the two reported lines, seeded games
// Misiorowski: 4 2/3 IP, 1 H, 1 ER, 62 pitches, lifted. Megill: 2 2/3 IP, 41
// pitches. Over the same seeded World Series Game 1 runs, every cheap exit of a
// dominant Misiorowski must carry an engine reason from the allowed set, and the
// planned quick hook must be the exception it is in real October baseball.
console.log('REPORTED LINES (World Series Game 1, ' + N + ' seeded games)');
{
  let cheap = 0, cheapPlanned = 0, badReason = [], megLong = 0, meg41 = 0, megEarly = 0, megApps = 0, starts = 0;
  for (let i = 0; i < N; i++) {
    const r = run(i, { tag: 'ps', ps: true });
    const rows = r.boxScore.players.home.pitchers;
    const sp = rows[0];
    if (/Misiorowski/.test(sp.name)) {
      starts++;
      if (sp.outs <= 14 && sp.pitches <= 70 && sp.h <= 2 && sp.er <= 1) {
        cheap++;
        const why = String(sp.exitReason || '');
        if (/^(injury|ejection)$/.test(why) || /^removed after allowing/.test(why)) { /* hurt, ejected, or charged runs (unearned count) */ }
        else if (/^planned workload reached/.test(why)) cheapPlanned++;
        else badReason.push(why || '(none)');
      }
    }
    const meg = rows.find((p) => /Megill/.test(p.name));
    if (meg) {
      megApps++;
      if (meg.outs >= 7) megLong++;
      if (meg.pitches >= 41) meg41++;
      const sub = r.boxScore.eventLog.events.find((e) => e.eventType === 'SUB' && e.fieldingTeam === 'home' && e.substitutionData && /Megill/.test(e.substitutionData.in));
      if (sub && sub.inning < 8 && !/injury|ejection/.test(sub.substitutionData.reason)) megEarly++;
    }
  }
  check('Misiorowski: no cheap exit without an allowed engine reason', badReason.length === 0, badReason.slice(0, 3).join(' / ') || 'none');
  check('Misiorowski: planned quick hook while dominant is rare (<= 3% of starts)', pct(cheapPlanned, starts) <= 3, cheapPlanned + ' of ' + starts + ' starts');
  check('Megill: no outing of 7+ outs (the reported 2 2/3 IP)', megLong === 0, megLong + ' of ' + megApps + ' appearances');
  // Real closers: 2.4% of 2022-2025 postseason outings reached 35 pitches.
  check('Megill: 41+ pitch outings at or below 1%', pct(meg41, megApps) <= 1, meg41 + ' of ' + megApps);
  check('Megill: never brought in before the 8th by choice', megEarly === 0, megEarly + ' of ' + megApps);
}

// ------------------------------------------------ workload ledger, one game
// BULLPEN_WORKLOAD_LEDGER_20261023. The shape is the backend's
// /api/mlb-data/teams/:id/bullpen payload as normalized by fetchBullpenWorkload.
console.log('WORKLOAD LEDGER (single game)');
{
  const lc = sim.state.liveContext;
  const MEGILL = 656730, URIBE = 682842;
  const ids = (fixture.teamRosters.MIL.players || []).filter((p) => /Megill|Uribe/.test(p.name)).map((p) => p.name + ':' + p.mlbId).join(', ');
  // No ledger at all and an empty ledger must play the identical game.
  const base = run(3, { tag: 'ledger', ps: true }).boxScore.players.home.pitchers.map((p) => p.name + p.outs + '/' + p.pitches).join();
  lc.bullpenWorkload = { MIL: { fetchedAt: Date.now(), byId: {}, count: 0 } };
  const empty = run(3, { tag: 'ledger', ps: true }).boxScore.players.home.pitchers.map((p) => p.name + p.outs + '/' + p.pitches).join();
  check('no ledger data: the game is unchanged (fail-open)', base === empty);
  lc.bullpenWorkload = { MIL: { fetchedAt: Date.now(), count: 2, byId: {
    [MEGILL]: { availability: 'unavailable', daysRest: 0, pitchesYesterday: 22, pitchesLast3d: 61, appsLast3d: 3 },
    [URIBE]: { availability: 'limited', daysRest: 0, pitchesYesterday: 31, pitchesLast3d: 31, appsLast3d: 1 } } } };
  let megillApps = 0, uribe = [], noted = 0, games = 400;
  for (let i = 0; i < games; i++) {
    const r = run(i, { tag: 'ledger', ps: true });
    const rows = r.boxScore.players.home.pitchers;
    if (rows.some((p) => /Megill/.test(p.name))) megillApps++;
    rows.filter((p) => /Uribe/.test(p.name)).forEach((p) => uribe.push(p));
    if ((r.liveFactors || []).some((f) => /Megill/.test(f) && /unavailable/.test(f))) noted++;
  }
  check('closer marked unavailable by recent use never pitches', megillApps === 0, megillApps + ' appearances in ' + games + ' (' + ids + ')');
  const uMax = uribe.reduce((m, p) => Math.max(m, p.outs), 0), uPc = uribe.reduce((m, p) => Math.max(m, p.pitches), 0);
  check('limited reliever is a short outing (max 5 outs)', uribe.length > 0 && uMax <= 5, uribe.length + ' outings, max ' + uMax + ' outs, max ' + uPc + ' pitches');
  check('the result explains the unavailable arm', noted === games, noted + ' of ' + games);
  lc.bullpenWorkload = {};
}

// ---------------------------------------------- series fatigue across games
console.log('SERIES FATIGUE (7-game World Series, real inputs)');
{
  const P = sim._postseason;
  const lc = sim.state.liveContext;
  sim.state.activeLiveContext = lc;
  lc.bullpenWorkload = { MIL: { fetchedAt: Date.now(), count: 1, byId: { 656730: { availability: 'unavailable', daysRest: 0, pitchesYesterday: 20, pitchesLast3d: 60, appsLast3d: 3 } } } };
  const games = [];
  P.simulatePostseasonSeries(TB, MIL, null, {
    round: P.ROUNDS.W, higher: MIL, lower: TB, winsHigher: 0, winsLower: 0, nSeries: 120, seed: 'pm-series',
    onGame: (g) => games.push({ series: g.series, game: g.game, day: g.day,
      arms: ['away', 'home'].map((k) => ({ abbr: k === 'away' ? g.awayAbbr : g.homeAbbr, forced: (g[k].forcedFatigued || []).slice(),
        used: g[k].pitchers.slice(1).filter((p) => (p.acc.bf || 0) > 0).map((p) => ({ n: p.name, outs: p.acc.outs || 0, role: p.role })) })) })
  });
  let g1Megill = 0, laterMegill = 0, ruleBreaks = 0, checked = 0, forcedUses = 0;
  const bySeries = {};
  games.forEach((g) => { (bySeries[g.series] = bySeries[g.series] || []).push(g); });
  Object.values(bySeries).forEach((list) => {
    list.sort((a, b) => a.game - b.game);
    list.forEach((g, gi) => {
      const mil = g.arms.find((a) => a.abbr === 'MIL');
      const meg = mil.used.some((p) => /Megill/.test(p.n));
      if (g.game === 1 && meg) g1Megill++;
      if (g.game > 1 && meg) laterMegill++;
      // the series rule: 5+ outs yesterday, or both of the last two days -> rests today
      g.arms.forEach((side) => side.used.forEach((p) => {
        if (p.role === 'POS' || /emergency/.test(p.n)) return;
        if (side.forced.indexOf(p.n) !== -1) { forcedUses++; return; } // recorded exception: nobody rested was left
        const prev = list.filter((x) => x.day === g.day - 1).map((x) => x.arms.find((a) => a.abbr === side.abbr).used.find((q) => q.n === p.n)).filter(Boolean)[0];
        const prev2 = list.filter((x) => x.day === g.day - 2).map((x) => x.arms.find((a) => a.abbr === side.abbr).used.find((q) => q.n === p.n)).filter(Boolean)[0];
        checked++;
        if ((prev && prev.outs >= 5) || (prev && prev2)) { ruleBreaks++; if (process.argv.includes('--debug') && ruleBreaks <= 5) console.log('   break', side.abbr, 'G' + g.game, 'day', g.day, p.n, p.role, 'prev', JSON.stringify(prev), 'prev2', JSON.stringify(prev2)); }
      }));
    });
  });
  check('pre-series ledger: unavailable closer sits out Game 1', g1Megill === 0, g1Megill + ' of ' + Object.keys(bySeries).length + ' Game 1s');
  check('after rest days he is back for later games', laterMegill > 0, laterMegill + ' later appearances');
  check('series rest rule holds in every simulated game (5+ outs or back-to-back -> rests)', ruleBreaks === 0, ruleBreaks + ' breaks over ' + checked + ' relief outings');
  check('tired arms pressed into use only when fewer than two rested remain, and rarely', pct(forcedUses, checked) <= 1, forcedUses + ' of ' + checked);
  lc.bullpenWorkload = {};
}

// ------------------------------------------------------------ marathon games
console.log('MARATHON (extra-inning games, both modes)');
{
  let ex = 0, long = 0, posTie = 0, generic = 0, reent = 0;
  [false, true].forEach((ps) => {
    for (let i = 0; i < N * 2; i++) {
      const r = run(i, { tag: 'mar', ps });
      const bx = r.boxScore; if (bx.totalInnings <= 9) continue;
      ex++; if (bx.totalInnings >= 13) long++;
      const events = (bx.eventLog && bx.eventLog.events) || [];
      ['away', 'home'].forEach((k) => {
        const rows = bx.players[k].pitchers;
        if (rows.some((p) => p.role === 'POS') && Math.abs(bx.away.runs - bx.home.runs) <= 4) posTie++;
        if (rows.some((p) => /emergency reliever/.test(p.name))) generic++;
        const seq = []; events.forEach((e) => { if (e.eventType === 'PA' && e.fieldingTeam === k && seq[seq.length - 1] !== e.pitcherId) seq.push(e.pitcherId); });
        if (new Set(seq).size !== seq.length) reent++;
      });
    }
  });
  check('extra-inning games: position player pitching in a close game (% team-games)', pct(posTie, ex * 2) <= 0.5, posTie + ' of ' + ex * 2 + ' (' + long + ' games went 13+)');
  check('extra-inning games: unnamed emergency arm (% team-games)', pct(generic, ex * 2) <= 2, generic + ' of ' + ex * 2);
  check('extra-inning games: no re-entry', reent === 0, String(reent));
}

// ------------------------------------------- randomized stress, every club
// Every current and historical club in random pairings (the no-reliever-stats
// path every historical club takes), with injuries and ejections forced ten
// times more often so unplanned changes hit every part of the ladder. Legality
// must hold in every game; usage is checked against loose real-world bounds.
{
  console.log('STRESS (' + N * 2 + ' random pairings, injuries/ejections x10)');
  const pool = sim.localTeams.current.concat(sim.localTeams.historical);
  let rng = 12345; const rnd = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
  sim.state.liveContext.teamRosters.TB = undefined; sim.state.liveContext.teamRosters.MIL = undefined;
  const ctxW = sim.state.liveContext;
  testWindow.__EL_INJURY_MULT = 10; testWindow.__EL_EJECT_MULT = 10;
  let reentry = 0, clEarly = 0, clApps = 0, cl7 = 0, posClose = 0, teamGames = 0, maxReliefOuts = 0, unreasoned = 0, illegalLine = 0, shortMaxHits = 0, shortWorst = '', noDamage = 0, noDamageEx = '', stressRunBad = 0, stressMaxOver = 0;
  for (let i = 0; i < N * 2; i++) {
    const a = pool[Math.floor(rnd() * pool.length)]; let h = pool[Math.floor(rnd() * pool.length)];
    if (h === a) h = pool[(pool.indexOf(a) + 1) % pool.length];
    const r = sim.simulate(a, h, ctxW, 'stress|' + i, false, 'clear', { wpSamples: 1 });
    const bx = r.boxScore, events = (bx.eventLog && bx.eventLog.events) || [];
    stressRunBad += auditRunScoring(events).length;
    ['away', 'home'].forEach((k) => { stressMaxOver = Math.max(stressMaxOver, bx[k].runs - bx[k].hits); });
    ['away', 'home'].forEach((k) => {
      teamGames++;
      const rows = bx.players[k].pitchers;
      const seq = [];
      events.forEach((e) => { if (e.eventType === 'PA' && e.fieldingTeam === k && e.pitcherId && seq[seq.length - 1] !== e.pitcherId) seq.push(e.pitcherId); });
      if (new Set(seq).size !== seq.length) reentry++;
      rows.forEach((p) => {
        if (p.role === 'CL') { clApps++; if (p.outs >= 7) cl7++; }
        if (p.role !== 'SP' && p.role !== 'POS' && p.role !== 'BULK') maxReliefOuts = Math.max(maxReliefOuts, p.outs);
        if (p.er > p.r || p.outs < 0) illegalLine++;
        if (p.role !== 'SP' && p.outs <= 3 && p.h > shortMaxHits) { shortMaxHits = p.h; shortWorst = p.name + ' ' + p.role; }
        if (p.role !== 'SP' && p.outs <= 6 && p.r === 0 && p.h > 4) { noDamage++; noDamageEx = p.name + ' ' + p.role + ' ' + p.outs + 'o ' + p.h + 'h ' + (p.exitReason || ''); }
      });
      if (Math.abs(bx.away.runs - bx.home.runs) <= 4 && rows.some((p) => p.role === 'POS') && bx.totalInnings <= 12) posClose++;
      events.forEach((e) => {
        if (e.eventType !== 'SUB' || e.fieldingTeam !== k || !e.substitutionData || e.substitutionData.role !== 'P') return;
        if (!e.substitutionData.reason || e.substitutionData.reason === 'pitching change') unreasoned++;
        const isCl = rows.some((p) => p.role === 'CL' && p.name.replace(/\s*\((LHP|RHP)\)$/, '') === String(e.substitutionData.in).replace(/\s*\((LHP|RHP)\)$/, ''));
        if (isCl && e.inning < 8 && e.substitutionData.reason !== 'injury' && e.substitutionData.reason !== 'ejection') clEarly++;
      });
    });
  }
  testWindow.__EL_INJURY_MULT = 0; testWindow.__EL_EJECT_MULT = 0;
  check('no pitcher re-entered (stress)', reentry === 0, reentry + ' of ' + teamGames + ' team-games');
  check('no impossible pitching line (ER > R)', illegalLine === 0, String(illegalLine));
  check('every run legally scored (stress)', stressRunBad === 0, stressRunBad + ' | max runs over hits ' + stressMaxOver);
  // 12,782 real one-inning relief appearances (2022-2025), position players included: max 7 hits.
  // 0 of 14,003 real outings of 2 IP or less (2022-2025 boxscores) went 5+ H, 0 R.
  check('no relief line of 2 IP or less with 5+ hits and no runs', noDamage === 0, noDamage + (noDamageEx ? ' (' + noDamageEx + ')' : ''));
  check('no one-inning relief line past 7 hits (any role, incl. position players)', shortMaxHits <= 7, 'max ' + shortMaxHits + ' (' + shortWorst + ')');
  check('closer entered before the 8th, not for injury (% of closer outings)', pct(clEarly, clApps) <= 1.5, pct(clEarly, clApps).toFixed(2) + '%');
  check('closer outings of 7+ outs, bullpens depleted by forced injuries (%)', pct(cl7, clApps) <= 1.5, pct(cl7, clApps).toFixed(2) + '%');
  check('position player pitched in a 9-12 inning game decided by 4 or fewer (%)', pct(posClose, teamGames) <= 0.5, pct(posClose, teamGames).toFixed(2) + '%');
  check('no one-role reliever past 4 innings in an outing', maxReliefOuts <= 13, 'max ' + maxReliefOuts + ' outs');
  check('every pitching change records the engine reason (stress)', unreasoned === 0, String(unreasoned));
}

// -------------------------------------- reconciliation without named rosters
// RECONCILE_UNNAMED_ROWS_20261023: a club whose roster feed is down plays a
// synthetic lineup with no names. The display drops those rows (no invented
// players); the reconciliation used to compare against the dropped rows and
// reported batting log=N engine=0 on every such game.
console.log('RECONCILIATION (roster-less clubs)');
{
  const savedTB = sim.state.liveContext.teamRosters.TB, savedMIL = sim.state.liveContext.teamRosters.MIL;
  const cur = sim.localTeams.current, his = sim.localTeams.historical;
  let bad = 0, games = 0, shownNames = 0;
  for (let i = 0; i < 200; i++) {
    const a = cur[i % cur.length], h = i % 2 ? his[i % his.length] : cur[(i * 7 + 3) % cur.length];
    if (a === h) continue;
    const r = sim.simulate(a, h, sim.state.liveContext, 'recon|' + i, false, 'clear', { wpSamples: 1 });
    games++;
    if (!r.boxScore.reconciliation || !r.boxScore.reconciliation.clean) bad++;
    shownNames += r.boxScore.players.away.batters.filter((b) => !b.name).length;
  }
  check('roster-less and mixed-era games reconcile', bad === 0, bad + ' of ' + games);
  check('no unnamed batter rows reach the display', shownNames === 0, String(shownNames));
  sim.state.liveContext.teamRosters.TB = savedTB; sim.state.liveContext.teamRosters.MIL = savedMIL;
}

// ---------------------------------------------------------- strikeout rate
// K_TRIM_RECAL_20261030: real MLB strikes out 22.2% (2025) / ~22% (2026) of
// batters. The June trim left the shipped build at 20.4-21.0% here, which is
// what this band rejects; the recalibrated build reads 22.5%.
console.log('STRIKEOUT RATE (600 league games)');
{
  const cur = sim.localTeams.current;
  let so = 0, bf = 0;
  for (let i = 0; i < 600; i++) {
    const a = cur[i % cur.length], h = cur[(i * 7 + 3) % cur.length];
    if (a === h) continue;
    const r = sim.simulate(a, h, sim.state.liveContext, 'krate|' + i, false, 'clear', { wpSamples: 1 });
    ['away', 'home'].forEach((k) => r.boxScore.players[k].pitchers.forEach((p) => { so += p.so; bf += p.bf; }));
  }
  const kp = so / bf;
  check('strikeout rate within the real 2025-26 band (21.5% to 23.5%)', kp >= 0.215 && kp <= 0.235, (100 * kp).toFixed(1) + '%');
}

// ------------------------------------------------------------- determinism
{
  const a = run(7, { tag: 'det', ps: true }).boxScore.players.home.pitchers.map((p) => p.name + p.outs + '/' + p.pitches).join();
  const b = run(7, { tag: 'det', ps: true }).boxScore.players.home.pitchers.map((p) => p.name + p.outs + '/' + p.pitches).join();
  check('same seed, same pitching lines', a === b);
}

console.log(failures ? 'RESULT: FAIL (' + failures + ')' : 'RESULT: PASS');
process.exit(failures ? 1 : 0);
