#!/usr/bin/env node
/*
 * MLB Simulator validation + calibration harness.
 *
 * Proves the plate-appearance engine in static/js/mlb-simulator.js is
 * statistically sound BEFORE any further realism layers are added. It runs the
 * engine offline (DOM/fetch stubbed) via the additive `_engine` test hook and
 * checks two tracks:
 *
 *   Track 1 - ENGINE INTEGRITY: every simulated game must produce internally
 *   valid baseball. Reconciles team totals vs player totals, pitcher runs vs
 *   opponent runs, K/BB/H/HR cross-totals, ER<=R, out accounting, and per-batter
 *   sanity. Any violation fails the run.
 *
 *   Track 2 - DISTRIBUTION CALIBRATION: large-sample league-average run, against
 *   documented MLB baselines, with numeric current-vs-target-vs-delta tables for
 *   runs, run distribution, totals, HR, K, BB, SB, shutout%, blowout%, extras,
 *   and max single-team runs.
 *
 *   Track 1b - END-TO-END: a smaller sample through the public simulate() to
 *   confirm the expected-run target is tracked and home-field edge is realistic.
 *
 * Usage:
 *   node scripts/validate-mlb-simulator.cjs [engineGames] [endToEndPairs]
 *   (defaults: 40000 engine games, 60 mirror pairs)
 *
 * Exit code 0 = integrity clean AND calibration within tolerance; 1 = otherwise.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ---- documented MLB baseline targets (approx 2024 league averages) -----------
const MLB = {
  runsPerTeam: 4.40,
  hrPerTeam: 1.12,
  kPerTeam: 8.60,
  bbPerTeam: 3.10,
  sbPerTeam: 0.70,
  shutoutTeamPct: 7.5,          // % of team-games scoring exactly 0
  gameTotalMean: 8.80,
  blowoutPct: 26.0,             // % of games decided by >= 5 runs (MLB ~1-in-4)
  extraInningPct: 8.5,          // % of games tied after 9
  homeWinPct: 53.5,             // home-field edge (mirror-pair isolation)
  // % of team-games scoring exactly k runs (7+ grouped). NOTE: 18.0 for 7+ is the
  // residual of the 0-6 estimates and sits near a pure-Poisson(4.4) value (~15.6%);
  // real MLB team runs are over-dispersed (variance/mean ~1.2), so the true 7+ rate
  // is likely ~19-21%. A faithful plate-appearance Markov engine naturally lands in
  // that range. Replace these with an authoritative season pull before treating the
  // 7+ row as a hard gate. (See calibration #2 notes in the dev notes.)
  runDist: { 0: 7.4, 1: 11.4, 2: 14.2, 3: 15.0, 4: 13.8, 5: 11.4, 6: 8.8, '7+': 18.0 },
};
const TOL = { runs: 0.30, hr: 0.20, k: 1.0, bb: 0.70, sb: 0.25, pct: 3.0, dist: 3.0, total: 0.6, homeWin: 3.0 };

// ---- load the production engine with browser globals stubbed ------------------
function fakeEl() {
  return { style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    getAttribute() { return null; }, appendChild() {}, removeChild() {}, scrollIntoView() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    textContent: '', innerHTML: '', value: '', disabled: false, click() {}, focus() {} };
}
global.document = { readyState: 'complete', getElementById() { return fakeEl(); }, createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl() };
global.window = global; global.location = { search: '', hash: '' }; global.window.location = global.location;
global.fetch = function () { return Promise.reject(new Error('offline-validation')); };
const enginePath = path.join(__dirname, '..', 'static', 'js', 'mlb-simulator.js');
eval(fs.readFileSync(enginePath, 'utf8'));
const SIM = global.TMRMlbSimulator;
if (!SIM || !SIM._engine) { console.error('FAIL: engine or _engine test hook not found'); process.exit(1); }
const ENG = SIM._engine;

function neutralTeam() {
  return { id: 'neutral', era: 'current', name: 'League Average', abbreviation: 'AVG',
    league: 'AL', division: 'X', offense: 100, runPrevention: 100, startingPitching: 100, bullpen: 100, volatility: 1.0 };
}
function neutralStarter() { return { name: 'SP', quality: 100, era: 4.20 }; }
function sum(arr, f) { return arr.reduce((t, x) => t + (f ? f(x) : x), 0); }
function r2(v) { return Math.round(v * 100) / 100; }
function r1(v) { return Math.round(v * 10) / 10; }

// ---- Track 1 integrity check on one engine game -------------------------------
function checkIntegrity(A, H, g, viol) {
  const accR = (s) => sum(s.lineup, b => b.acc.r);
  const accStat = (s, k) => sum(s.lineup, b => b.acc[k]);
  const pStat = (s, k) => sum(s.pitchers, p => p.acc[k]);
  function fail(type) { viol[type] = (viol[type] || 0) + 1; }

  if (accR(A) !== g.aRuns) fail('away_batterRuns!=teamRuns');
  if (accR(H) !== g.hRuns) fail('home_batterRuns!=teamRuns');
  // pitcher runs allowed == opponent runs scored
  if (pStat(H, 'r') !== g.aRuns) fail('homePitcherR!=awayRuns');
  if (pStat(A, 'r') !== g.hRuns) fail('awayPitcherR!=homeRuns');
  // hits / K / BB / HR cross-totals (pitcher staff vs opposing batters)
  if (pStat(H, 'h') !== accStat(A, 'h')) fail('homePitcherH!=awayBatterH');
  if (pStat(A, 'h') !== accStat(H, 'h')) fail('awayPitcherH!=homeBatterH');
  if (pStat(H, 'so') !== accStat(A, 'so')) fail('homePitcherK!=awayBatterK');
  if (pStat(H, 'bb') !== accStat(A, 'bb')) fail('homePitcherBB!=awayBatterBB');
  if (pStat(H, 'hr') !== accStat(A, 'hr')) fail('homePitcherHR!=awayBatterHR');
  // ER <= R per staff
  if (pStat(A, 'er') > pStat(A, 'r')) fail('awayER>R');
  if (pStat(H, 'er') > pStat(H, 'r')) fail('homeER>R');
  // out accounting: away always completes its innings (multiple of 3, >=27);
  // home plays <= away and at most 3 fewer outs (walk-off / skipped bottom 9)
  const outsH = pStat(H, 'outs'), outsA = pStat(A, 'outs');
  if (outsH % 3 !== 0 || outsH < 27) fail('homePitcherOutsInvalid');
  if (outsH - outsA < 0 || outsH - outsA > 3) fail('outsSplitInvalid');
  // runs cannot exceed runners who reached (hits + walks + reach-on-error)
  if (g.aRuns > accStat(A, 'h') + accStat(A, 'bb') + g.hErr) fail('awayRuns>reachers');
  if (g.hRuns > accStat(H, 'h') + accStat(H, 'bb') + g.aErr) fail('homeRuns>reachers');
  // per-batter sanity
  [A, H].forEach((s, si) => s.lineup.forEach(b => {
    const a = b.acc;
    if (a.h > a.ab) fail('batterH>AB');
    if (a.so > a.ab) fail('batterK>AB');
    if (a.hr > a.h) fail('batterHR>H');
    if (a.r < 0 || a.rbi < 0) fail('batterNegative');
  }));
  if (g.aRuns < 0 || g.hRuns < 0 || g.aErr < 0 || g.hErr < 0) fail('negativeTeamStat');
}

// ============================ TRACK 2 + TRACK 1 (engine isolation) =============
function runEngineSample(n) {
  const away = neutralTeam(), home = neutralTeam();
  const inputs = ENG.buildEventInputs(away, home, neutralStarter(), neutralStarter(), MLB.runsPerTeam, MLB.runsPerTeam, null);
  const A = inputs.awaySide, H = inputs.homeSide;
  const viol = {};
  const teamRuns = [], totals = [], hr = [], k = [], bb = [], sb = [], hits = [];
  let shutoutTeam = 0, teamGames = 0, blowout = 0, extra = 0, maxTeam = 0, homeRunsSum = 0, awayRunsSum = 0;
  const runBuckets = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, '7+': 0 };
  for (let i = 0; i < n; i++) {
    const g = ENG.evSimGame(A, H, Math.random);
    checkIntegrity(A, H, g, viol);
    awayRunsSum += g.aRuns; homeRunsSum += g.hRuns;
    [[A, g.aRuns], [H, g.hRuns]].forEach(([s, runs]) => {
      teamGames++; teamRuns.push(runs);
      hr.push(sum(s.lineup, b => b.acc.hr)); k.push(sum(s.lineup, b => b.acc.so));
      bb.push(sum(s.lineup, b => b.acc.bb)); sb.push(s.sb || 0); hits.push(sum(s.lineup, b => b.acc.h));
      if (runs === 0) shutoutTeam++;
      runBuckets[runs >= 7 ? '7+' : runs]++;
      if (runs > maxTeam) maxTeam = runs;
    });
    totals.push(g.aRuns + g.hRuns);
    if (Math.abs(g.aRuns - g.hRuns) >= 5) blowout++;
    if (g.extra > 9) extra++;
  }
  return {
    n, teamGames, viol,
    runsPerTeam: (awayRunsSum + homeRunsSum) / teamGames,
    awayPerGame: awayRunsSum / n, homePerGame: homeRunsSum / n,
    hrPerTeam: sum(hr) / teamGames, kPerTeam: sum(k) / teamGames, bbPerTeam: sum(bb) / teamGames,
    sbPerTeam: sum(sb) / teamGames, hitsPerTeam: sum(hits) / teamGames,
    shutoutTeamPct: 100 * shutoutTeam / teamGames,
    gameTotalMean: sum(totals) / n, blowoutPct: 100 * blowout / n, extraInningPct: 100 * extra / n,
    maxTeam,
    runDist: Object.fromEntries(Object.entries(runBuckets).map(([key, v]) => [key, 100 * v / teamGames])),
  };
}

// ============================ TRACK 1b: end-to-end =============================
function runEndToEnd(pairs) {
  const teams = SIM.localTeams.current;
  SIM.state.simulationCount = 10; // -> wpSamples 90 per call, keeps it fast
  let homeWins = 0, games = 0, targetSum = 0, realizedSum = 0, e2eViol = 0;
  // Deterministic, repeatable matchup set: every team hosts/visits a fixed spread
  // of opponents (offsets) in BOTH orientations (mirror pairs isolate home edge),
  // each matchup replicated REPS times so the aggregate drift is reproducible run
  // to run instead of depending on a random draw of teams.
  const REPS = Math.max(2, Math.round(pairs / 6));
  const offsets = [1, 7, 14, 22]; // near, medium, far rating gaps across the list
  const matchups = [];
  for (let i = 0; i < teams.length; i++) {
    offsets.forEach((off) => {
      const j = (i + off) % teams.length;
      if (j !== i) { matchups.push([i, j]); matchups.push([j, i]); }
    });
  }
  matchups.forEach(([ai, hi]) => {
    const a = teams[ai], h = teams[hi];
    for (let rep = 0; rep < REPS; rep++) {
      const s = SIM.simulate(a, h, null, 'e2e' + ai + '-' + hi + '-' + rep, true);
      games++;
      homeWins += s.homeWin;
      targetSum += s.awayRuns + s.homeRuns;
      realizedSum += s.boxScore.away.runs + s.boxScore.home.runs;
      const bx = s.boxScore;
      if (bx.away.runs !== bx.away.innings.reduce((t, x) => t + x, 0)) e2eViol++;
      if (bx.home.runs !== bx.home.innings.reduce((t, x) => t + x, 0)) e2eViol++;
      if (sum(bx.players.home.pitchers, pp => pp.r) !== bx.away.runs) e2eViol++; // home P runs == away runs
      if (sum(bx.players.away.pitchers, pp => pp.r) !== bx.home.runs) e2eViol++;
    }
  });
  return { games, homeWinPct: 100 * homeWins / games, targetMean: targetSum / games, realizedMean: realizedSum / games, e2eViol };
}

// ---- reporting ----------------------------------------------------------------
function row(label, cur, tgt, tol, unit) {
  const d = cur - tgt; const miss = Math.abs(d) > tol;
  const f = (v) => (unit === '%' ? r1(v) + '%' : r2(v));
  return { line: `  ${label.padEnd(26)} ${String(f(cur)).padStart(9)} ${String(f(tgt)).padStart(9)} ${String((d >= 0 ? '+' : '') + (unit === '%' ? r1(d) + '%' : r2(d))).padStart(9)}   ${miss ? 'MISS' : 'ok'}`, miss };
}

function main() {
  const engineGames = Number(process.argv[2] || 40000);
  const pairs = Number(process.argv[3] || 60);
  console.log('MLB SIMULATOR VALIDATION  (engine build: ' + SIM.uiBuild + ')');
  console.log('Engine sample: ' + engineGames + ' games | End-to-end: ' + (pairs * 2) + ' mirror games\n');

  const R = runEngineSample(engineGames);

  console.log('TRACK 1 - ENGINE INTEGRITY (' + R.n + ' games, ' + R.teamGames + ' team-games)');
  const violKeys = Object.keys(R.viol);
  if (!violKeys.length) console.log('  PASS: 0 integrity violations across all checks.\n');
  else { console.log('  FAIL: integrity violations:'); violKeys.forEach(key => console.log('    ' + key + ': ' + R.viol[key])); console.log(''); }

  console.log('TRACK 2 - DISTRIBUTION CALIBRATION (current engine vs MLB baseline)');
  console.log('  metric                        current    target     delta   flag');
  const rows = [
    row('Runs / team / game', R.runsPerTeam, MLB.runsPerTeam, TOL.runs),
    row('Game total (mean)', R.gameTotalMean, MLB.gameTotalMean, TOL.total),
    row('HR / team', R.hrPerTeam, MLB.hrPerTeam, TOL.hr),
    row('K / team', R.kPerTeam, MLB.kPerTeam, TOL.k),
    row('BB / team', R.bbPerTeam, MLB.bbPerTeam, TOL.bb),
    row('SB / team', R.sbPerTeam, MLB.sbPerTeam, TOL.sb),
    row('Shutout % (team=0)', R.shutoutTeamPct, MLB.shutoutTeamPct, TOL.pct, '%'),
    row('Blowout % (>=5)', R.blowoutPct, MLB.blowoutPct, TOL.pct, '%'),
    row('Extra-inning %', R.extraInningPct, MLB.extraInningPct, TOL.pct, '%'),
  ];
  rows.forEach(x => console.log(x.line));
  console.log('  (home/away per-game: ' + r2(R.homePerGame) + ' / ' + r2(R.awayPerGame) + ' | hits/team ' + r2(R.hitsPerTeam) + ' | max single-team runs ' + R.maxTeam + ')\n');

  console.log('  Team run distribution (% of team-games scoring exactly k):');
  console.log('  runs                          current    target     delta   flag');
  const distRows = Object.keys(MLB.runDist).map(key => row('  scored ' + key, R.runDist[key], MLB.runDist[key], TOL.dist, '%'));
  distRows.forEach(x => console.log(x.line));
  console.log('');

  const E = runEndToEnd(pairs);
  console.log('TRACK 1b - END-TO-END via simulate() (' + E.games + ' games)');
  console.log('  Box-score integrity violations: ' + E.e2eViol + (E.e2eViol ? '  FAIL' : '  PASS'));
  console.log('  Target run total (mean):   ' + r2(E.targetMean));
  console.log('  Realized run total (mean): ' + r2(E.realizedMean) + '  (drift ' + (E.realizedMean >= E.targetMean ? '+' : '') + r2(E.realizedMean - E.targetMean) + ', ' + r1(100 * (E.realizedMean - E.targetMean) / E.targetMean) + '%)');
  const hw = row('Home win % (mirror pairs)', E.homeWinPct, MLB.homeWinPct, TOL.homeWin, '%');
  console.log(hw.line + '\n');

  const calMisses = rows.concat(distRows, [hw]).filter(x => x.miss).length;
  const integrityClean = !violKeys.length && !E.e2eViol;
  const targetDrift = Math.abs(E.realizedMean - E.targetMean) / E.targetMean;
  console.log('SUMMARY: integrity ' + (integrityClean ? 'CLEAN' : 'FAILED') + ' | calibration misses ' + calMisses + ' | end-to-end target drift ' + r1(100 * targetDrift) + '%');
  const pass = integrityClean && calMisses === 0 && targetDrift <= 0.06;
  console.log(pass ? 'RESULT: PASS' : 'RESULT: REVIEW (see MISS/FAIL rows above)');
  process.exit(pass ? 0 : 1);
}
main();
