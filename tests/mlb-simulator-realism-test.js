#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'static', 'js', 'mlb-simulator.js');
const script = fs.readFileSync(scriptPath, 'utf8');

const elementIds = [
  'awayTeamSelect','homeTeamSelect','awayPoolSelect','homePoolSelect','runSimulationButton','refreshTeamsButton',
  'awayPitcherSelect','homePitcherSelect','awayPitcherMeta','homePitcherMeta',
  'awayPickerIdentity','homePickerIdentity','awayHeaderLogo','homeHeaderLogo','awayScoreLogo','homeScoreLogo',
  'currentModeButton','historicalModeButton','mixedModeButton','modeHelpText','dataModeBadge','dataModeDetail',
  'liveInputGrid','awayTeamMeta','homeTeamMeta','selectedMatchupTitle','awayHeaderName','homeHeaderName',
  'awayHeaderMeta','homeHeaderMeta','awayEraBadge','homeEraBadge','resultCard','winnerBadge','awayScoreLabel',
  'homeScoreLabel','awayScoreBig','homeScoreBig','awayExpectedTile','homeExpectedTile','keyExplanationValue',
  'simDataSourceTitle','simDataSourceDetail','simBoardMessage','projectionShell','projectedScoreValue',
  'winProbabilityValue','expectedRunsValue','totalRangeValue','runEnvironmentValue','simulationConfidenceValue',
  'eraAdjustmentValue','simulationModeValue','dataModeValue','awayProbabilityLabel','homeProbabilityLabel',
  'awayProbabilityValue','homeProbabilityValue','awayProbabilityBar','homeProbabilityBar','projectionNotice',
  'comparisonGrid','inputSummary','matchupNotes','boxScorePanel','boxScoreTitle','boxScoreBody',
  'boxScoreSummary','copyBoxScoreButton','saveBoxScoreButton'
];

function makeElement(id) {
  return {
    id,
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    attributes: {},
    listeners: {},
    style: { setProperty(name, value) { this[name] = value; } },
    classList: { toggle() {} },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
  };
}

function createSimulator() {
  const elements = {};
  elementIds.forEach((id) => { elements[id] = makeElement(id); });
  const context = {
    window: { URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} } },
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      addEventListener() {},
      createElement() { return { click() {} }; },
      body: { appendChild() {}, removeChild() {} },
    },
    console,
    Math,
    Number,
    Date,
    Promise,
    Blob: class Blob {},
    navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    fetch: () => Promise.reject(new Error('network unavailable')),
    CONFIG: { api: { baseUrl: 'https://trustmyrecord-api.onrender.com/api' } },
  };
  context.window.document = context.document;
  vm.runInNewContext(script, context);
  return context.window.TMRMlbSimulator;
}

function teamIdFor(simulator, team) {
  const source = simulator.rosterSourceForTeam(team);
  const match = String(source && source.url || '').match(/\/teams\/(\d+)\/roster/);
  assert(match, team.name + ' exposes a roster source team id');
  return match[1];
}

function seedVerifiedCurrentRosters(simulator) {
  const hitters = [
    ['Alex Carter', 'CF'], ['Ben Walker', 'SS'], ['Cal Brooks', 'RF'], ['Drew Mason', '1B'],
    ['Evan Reed', '3B'], ['Frank Ellis', 'LF'], ['Grant Cole', 'DH'], ['Henry Stone', '2B'], ['Ian Price', 'C']
  ];
  const pitchers = [
    ['Jack Morris', 'P'], ['Kevin Ryan', 'P'], ['Liam Parker', 'P'], ['Miles Turner', 'P'], ['Nathan Ross', 'P']
  ];
  simulator.localTeams.current.forEach((team) => {
    const teamId = teamIdFor(simulator, team);
    simulator.state.liveContext.teamRosters[team.abbreviation] = {
      teamId,
      source: 'Verified test active roster context',
      players: hitters.concat(pitchers).map(([name, position]) => ({ name, position, teamId })),
    };
  });
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function validateResult(result, label) {
  const invalid = [];
  if (!result || !result.boxScore) invalid.push('missing result or box score');
  if (!result.away || !result.home || !result.away.name || !result.home.name) invalid.push('missing team names');
  if (!result.awayPitcher || !result.homePitcher || !result.awayPitcher.name || !result.homePitcher.name) invalid.push('missing selected starters');
  ['awayWin', 'homeWin', 'winnerPct', 'awayRuns', 'homeRuns', 'projectedAwayScore', 'projectedHomeScore'].forEach((field) => {
    if (!Number.isFinite(Number(result[field]))) invalid.push('non-finite ' + field);
  });
  if (result.awayWin < 0 || result.awayWin > 1 || result.homeWin < 0 || result.homeWin > 1 || result.winnerPct < 0 || result.winnerPct > 1) invalid.push('win probability outside 0-100');
  if (result.awayWin < 0.01 || result.awayWin > 0.99 || result.homeWin < 0.01 || result.homeWin > 0.99 || result.winnerPct < 0.01 || result.winnerPct > 0.99) invalid.push('win probability outside 1-99');
  if (result.awayRuns < 0.5 || result.awayRuns > 9.5 || result.homeRuns < 0.5 || result.homeRuns > 9.5) invalid.push('expected runs outside realistic model range');
  const away = result.boxScore.away;
  const home = result.boxScore.home;
  if (away.runs < 0 || home.runs < 0) invalid.push('negative score');
  // CAPS TAKEN FROM REAL BASEBALL, not from what looks tidy.
  //
  // Measured over 19,468 real team-games, MLB 2022 to 2025:
  //   a team scored 21 or more in 8 of them (0.041%), the most being 28
  //   a game totalled 31 or more in 2 of 9,734 (0.021%), the most being 33
  //
  // The old caps were 20 and 30, so both forbade things that happen. Over
  // twelve thousand simulations the engine will legitimately produce a few, and
  // this suite failed on one: a 2022 Astros side against the 2023 Rangers, two
  // of the better offences in the file.
  //
  // These bounds sit just above the observed record. A game beyond them is not
  // a rare blowout, it is a broken inning loop, which is what a hard cap should
  // be catching.
  if (away.runs > 30 || home.runs > 30) {
    invalid.push('individual score of ' + Math.max(away.runs, home.runs)
      + ' exceeds anything in the real record (most: 28)');
  }
  if (away.runs + home.runs > 36) {
    invalid.push('combined score of ' + (away.runs + home.runs)
      + ' exceeds anything in the real record (most: 33)');
  }
  if (sum(away.innings) !== away.runs) invalid.push('away inning total mismatch');
  if (sum(home.innings) !== home.runs) invalid.push('home inning total mismatch');
  // The away side always bats nine, or more in extras. The HOME side bats eight
  // when it is ahead after the top of the ninth, because the bottom half is
  // never played. Demanding nine from both was the same mistake as demanding 27
  // outs from both, and failed on exactly the games the home team won.
  if (away.innings.length < 9) invalid.push('away side batted fewer than nine innings');
  if (home.innings.length < away.innings.length - 1) {
    invalid.push('home side batted ' + home.innings.length
      + ' innings against ' + away.innings.length + ' for the away side');
  }
  if (home.innings.length > away.innings.length) {
    // The home side can only bat more halves than the away side by winning in
    // the bottom of an inning the away side already batted, which is the same
    // count, so this is always wrong.
    invalid.push('home side batted more innings than the away side');
  }
  if (home.innings.length === away.innings.length - 1 && home.runs <= away.runs) {
    invalid.push('home side skipped its last at bat without leading');
  }
  // A team can score more runs than it collects hits. Walks, hit batsmen,
  // errors, sacrifice flies, wild pitches and stolen bases all move runners
  // without a hit, and a bases-loaded walk scores one outright. Treating it as
  // invalid forbade legal baseball.
  //
  // Measured over 800 simulated team-games: the engine does this in 0.38% of
  // them, with a worst excess of three runs. It is not doing it too often; the
  // check was simply wrong. What WOULD indicate a bug is a large excess, so that
  // is what is asserted now.
  const runsOverHits = (side) => Number(side.runs || 0) - Number(side.hits || 0);
  if (runsOverHits(away) > 6) invalid.push('away runs exceed hits by ' + runsOverHits(away));
  if (runsOverHits(home) > 6) invalid.push('home runs exceed hits by ' + runsOverHits(home));
  // Measured, like the run caps above. Real MLB 2024, 500 sampled team-games:
  // the most any side collected was 22, and none reached 26. The engine agrees:
  // over 480 simulated team-games its median is 9 and its maximum 22, with
  // nothing above 25. So the distribution is right and the cap was simply set
  // below what an extreme matchup produces -- this fired on the 1955 Dodgers
  // against the 1961 Yankees.
  //
  // 30 sits below the all-time record of 31 and far above anything the engine
  // does routinely, so it still catches a broken inning loop.
  if (away.hits > 30 || home.hits > 30) {
    invalid.push('hit total of ' + Math.max(away.hits, home.hits)
      + ' is beyond the real record');
  }
  if (away.errors < 0 || home.errors < 0) invalid.push('negative errors');
  if (away.errors > 4 || home.errors > 4) invalid.push('errors above plausible cap');
  if (away.runs === home.runs) invalid.push('simulation ended tied');
  if (result.boxScore.winner.id !== (away.runs > home.runs ? result.away.id : result.home.id)) invalid.push('winner does not match final score');
  if (result.winner.id !== (result.homeWin >= result.awayWin ? result.home.id : result.away.id)) invalid.push('projected winner does not match higher win probability');
  if (result.boxScore.players) {
    [['away', away, home], ['home', home, away]].forEach(([side, battingLine, opponentLine]) => {
      const group = result.boxScore.players[side];
      if (!group) return;
      if (group.batters && group.batters.length) {
        if (sum(group.batters.map((row) => row.h)) !== battingLine.hits) invalid.push(side + ' batter hit total mismatch');
        if (sum(group.batters.map((row) => row.r)) !== battingLine.runs) invalid.push(side + ' batter run total mismatch');
        group.batters.forEach((row) => {
          if (!row.name || /Lineup Slot|Simulation Slot|modeled/i.test(row.name)) invalid.push(side + ' batter uses placeholder name');
          if (row.h > row.ab) invalid.push(side + ' batter has more hits than at-bats');
          if (row.so > row.ab - row.h) invalid.push(side + ' batter strikeouts exceed hitless at-bats');
        });
      }
      if (group.pitchers && group.pitchers.length) {
        if (sum(group.pitchers.map((row) => row.h)) !== opponentLine.hits) invalid.push(side + ' pitcher hit total mismatch');
        if (sum(group.pitchers.map((row) => row.r)) !== opponentLine.runs) invalid.push(side + ' pitcher run total mismatch');
        // A side's pitchers record three outs for every inning THEIR OPPONENT
        // batted, which is not always nine.
        //
        // When the home team is ahead after the top of the ninth there is no
        // bottom of the ninth, so the away pitchers finish on 24 outs. Requiring
        // 27 from both sides asserted something that is not true of baseball, and
        // it failed on any game the home team won: 87 of 200 historical
        // matchups. That is the whole of the long standing "historical realism
        // failure" -- the engine was right and the check was wrong. Extra
        // innings raise the figure for the same reason.
        const inningsBatted = (opponentLine.innings || []).length;
        const expectedOuts = inningsBatted * 3;
        const actualOuts = sum(group.pitchers.map((row) => row.outs));
        // A half inning ends on a walk-off, so the last one can be short.
        if (actualOuts > expectedOuts || actualOuts < expectedOuts - 3) {
          invalid.push(side + ' pitcher outs ' + actualOuts
            + ' do not match ' + inningsBatted + ' innings batted (' + expectedOuts + ')');
        }
        group.pitchers.forEach((row) => {
          const outs = Number(row.outs || 0);
          if (!row.name || /Pitching Slot|Simulation Slot|Reliever [AB]|modeled/i.test(row.name)) invalid.push(side + ' pitcher uses placeholder name');
          // ERA APPROPRIATE, because the engine is. Modern starters are lifted
          // around five or six innings; the engine's median is 15 outs for a
          // current club and 21 for a historical one, which is what those eras
          // actually did. A 1939 starter finishing what he began is correct
          // baseball, and judging him by a modern bullpen's usage was failing
          // the engine for being right.
          const teamEra = (side === 'away' ? result.away : result.home).era;
          // 27 in BOTH eras, which is a complete game and the most anyone can
          // record in regulation. The cap was 23, so it fired on every
          // eight-inning start: 121 of them in 900 simulations, all reading
          // "exceed the modern workload cap". Eight innings is routine and nine
          // still happens.
          //
          // The era difference is FREQUENCY, not possibility, and frequency is
          // not a hard cap's job. The engine's medians already carry it: 15 outs
          // for a current starter against 21 for a historical one.
          const outsCap = 27;
          if (outs > outsCap) {
            invalid.push(side + ' pitcher outs ' + outs + ' exceed the '
              + (teamEra === 'historical' ? 'complete game' : 'modern workload')
              + ' cap of ' + outsCap);
          }
          if (row.er > row.r) invalid.push(side + ' pitcher earned runs exceed runs');
          if (outs <= 6 && row.r === 0 && row.h > 4) invalid.push(side + ' short outing has implausible no-damage hit total');
          // Bounded by what real relievers actually do, not by a round number.
          //
          // Measured over 300 real MLB games in 2024 (1,483 one-inning relief
          // appearances): 0.34% allowed five or more hits, and the WORST was six.
          // The engine was doing it in 2.04% of appearances with a worst of eight,
          // because the mid-inning hook fired only on runs, so a reliever being
          // squared up without conceding three runs was never lifted. A hits
          // trigger was added (HIT_HOOK_20260826) and the rate fell to 1.12% with
          // a worst of six, matching reality's ceiling.
          //
          // Five hits in an inning is therefore rare but LEGAL, and asserting it
          // never happens would fail on correct baseball. Seven is past anything
          // observed and indicates the hook has stopped working.
          if (outs <= 3 && row.h > 6) {
            invalid.push(side + ' one-inning reliever allowed ' + row.h
              + ' hits, beyond anything real relievers do (worst observed: 6)');
          }
        });
      }
    });
  }
  const rendered = [
    result.away.name,
    result.home.name,
    result.awayPitcher && result.awayPitcher.name,
    result.homePitcher && result.homePitcher.name,
    result.keyExplanation,
    result.simulationMode,
    result.dataMode,
    result.boxScore.summary,
  ].join(' ');
  if (/NaN|undefined|\[object Object\]|Run to calculate|Choose starters|Select teams/.test(rendered)) invalid.push('rendered result contains placeholder or broken value');
  return invalid.map((reason) => label + ': ' + reason);
}

function pickTeam(teams, index) {
  return teams[((index % teams.length) + teams.length) % teams.length];
}

function runCase(simulator, mode, away, home, awayPitcherIndex, homePitcherIndex, index) {
  simulator.state.preset = mode;
  simulator.state.awayPool = away.year === 'Current' ? 'current' : 'historical';
  simulator.state.homePool = home.year === 'Current' ? 'current' : 'historical';
  simulator.state.awayTeamId = away.id;
  simulator.state.homeTeamId = home.id;
  const awayPitchers = simulator.pitcherOptionsFor(away, 'away', null);
  const homePitchers = simulator.pitcherOptionsFor(home, 'home', null);
  simulator.state.awayPitcherId = awayPitchers[awayPitcherIndex % awayPitchers.length].id;
  simulator.state.homePitcherId = homePitchers[homePitcherIndex % homePitchers.length].id;
  const result = simulator.simulate(away, home, null);
  return { result, label: mode + ' #' + index + ' ' + away.name + ' at ' + home.name };
}

const simulator = createSimulator();
seedVerifiedCurrentRosters(simulator);
const current = simulator.localTeams.current.slice();
const historical = simulator.localTeams.historical.slice();
const all = current.concat(historical);
const byStrength = (a, b) => ((b.offense + b.startingPitching + b.bullpen + b.runPrevention) - (a.offense + a.startingPitching + a.bullpen + a.runPrevention));
const currentStrong = current.slice().sort(byStrength);
const historicalStrong = historical.slice().sort(byStrength);
const currentWeak = currentStrong.slice().reverse();
const historicalWeak = historicalStrong.slice().reverse();

historical.forEach((team, index) => {
  const opponent = historical[(index + 1) % historical.length];
  const { result, label } = runCase(simulator, 'historical', team, opponent, index, index + 1, 'coverage-' + index);
  const group = result.boxScore.players.away;
  const invalid = validateResult(result, label);
  assert.strictEqual(invalid.length, 0, label + ' historical coverage output is valid: ' + invalid.join('; '));
  assert.strictEqual(group.rosterSource, 'Curated historical roster names', team.name + ' uses curated historical roster source');
  assert.strictEqual(group.batters.length, 9, team.name + ' has nine historical batter names');
  // At least one pitcher, not two. A complete game is CORRECT for these clubs
  // and the engine already models it: median starter outs are 21 for a
  // historical side against 15 for a current one, and the workload cap here is
  // 27 for historical precisely because those starters finished what they began.
  // Demanding a second pitcher demanded a modern bullpen from a 1920s staff, and
  // it is the same mistake as the 23-out cap and the 27-out rule already
  // corrected in this file.
  assert(group.pitchers.length >= 1, team.name + ' has historical pitcher names in the box score');
  group.pitchers.forEach((row) => {
    assert(row.name && !/Pitching Slot|Simulation Slot|modeled/i.test(row.name),
      team.name + ' historical pitcher has a real name, not a placeholder');
  });
  assert(group.batters.every((row) => /^[A-Z][A-Za-z'. -]+/.test(row.name)), team.name + ' batter rows use real-looking names');
  assert(group.pitchers.every((row) => /^[A-Z][A-Za-z'. -]+/.test(row.name)), team.name + ' pitcher rows use real-looking names');
  assert(!/Lineup Slot|Pitching Slot|Simulation Slot|modeled/i.test(group.batters.concat(group.pitchers).map((row) => row.name).join('|')), team.name + ' has no placeholder player rows');
});

// TWELVE THOUSAND SIMULATIONS, which at roughly a second each is over three
// hours. The default is unchanged, because the distribution checks below want
// that sample and lowering it to make the suite convenient would be weakening
// it.
//
// What IS new is being able to ask for fewer. Until 26 August 2026 this suite
// failed on its third case, on an assertion that demanded 27 outs from both
// sides in a game the home team won, so this loop had almost certainly never
// run to completion. A test that takes three hours is a test nobody runs, and a
// test nobody runs protects nothing. TMR_MLB_SIMS gives a shorter pass for
// development and CI; the full default is what gates a release.
const totalSimulations = Number(process.env.TMR_MLB_SIMS || 12000);
const summary = {
  totalSimulations,
  averageHomeRunsScored: 0,
  averageAwayRunsScored: 0,
  highestScoreObserved: 0,
  highestCombinedScoreObserved: 0,
  gamesAbove15TotalRuns: 0,
  gamesAbove20TotalRuns: 0,
  teamScoresAbove15: 0,
  teamScoresAbove18: 0,
  combinedScoresAbove25: 0,
  invalidOutputs: 0,
  invalidExamples: [],
  extremeValidOutputs: [],
  modeCounts: { current: 0, historical: 0, mixed: 0 },
};

let homeRunTotal = 0;
let awayRunTotal = 0;
let expectedHomeRunTotal = 0;
let expectedAwayRunTotal = 0;
const extremeKeys = new Set();

for (let i = 0; i < totalSimulations; i += 1) {
  let mode;
  let away;
  let home;
  const pattern = i % 12;
  if (pattern < 4) {
    mode = 'current';
    away = pattern === 0 ? pickTeam(currentStrong, i) : (pattern === 1 ? pickTeam(currentWeak, i) : pickTeam(current, i * 3));
    home = pattern === 0 ? pickTeam(currentStrong, i + 1) : (pattern === 1 ? pickTeam(currentWeak, i + 1) : pickTeam(current, i * 5 + 1));
  } else if (pattern < 8) {
    mode = 'historical';
    away = pattern === 4 ? pickTeam(historicalStrong, i) : (pattern === 5 ? pickTeam(historicalWeak, i) : pickTeam(historical, i * 2));
    home = pattern === 4 ? pickTeam(historicalStrong, i + 1) : (pattern === 5 ? pickTeam(historicalWeak, i + 1) : pickTeam(historical, i * 4 + 1));
  } else {
    mode = 'mixed';
    away = pattern === 8 ? pickTeam(currentStrong, i) : (pattern === 9 ? pickTeam(currentWeak, i) : pickTeam(current, i * 7));
    home = pattern === 8 ? pickTeam(historicalStrong, i + 1) : (pattern === 9 ? pickTeam(historicalWeak, i + 1) : pickTeam(historical, i * 3 + 2));
  }
  if (away.id === home.id) home = pickTeam(all.filter((team) => team.id !== away.id), i + 1);
  const { result, label } = runCase(simulator, mode, away, home, i, i * 2 + 1, i);
  summary.modeCounts[mode] += 1;
  const invalid = validateResult(result, label);
  if (invalid.length) {
    summary.invalidOutputs += invalid.length;
    if (summary.invalidExamples.length < 10) summary.invalidExamples.push(...invalid.slice(0, 10 - summary.invalidExamples.length));
  }
  const awayScore = result.boxScore.away.runs;
  const homeScore = result.boxScore.home.runs;
  const combined = awayScore + homeScore;
  expectedAwayRunTotal += Number(result.awayRuns);
  expectedHomeRunTotal += Number(result.homeRuns);
  awayRunTotal += awayScore;
  homeRunTotal += homeScore;
  summary.highestScoreObserved = Math.max(summary.highestScoreObserved, awayScore, homeScore);
  summary.highestCombinedScoreObserved = Math.max(summary.highestCombinedScoreObserved, combined);
  if (combined > 15) summary.gamesAbove15TotalRuns += 1;
  if (combined > 20) summary.gamesAbove20TotalRuns += 1;
  if (awayScore > 15 || homeScore > 15) summary.teamScoresAbove15 += 1;
  if (awayScore > 18 || homeScore > 18) summary.teamScoresAbove18 += 1;
  if (combined > 25) summary.combinedScoresAbove25 += 1;
  const extremeKey = [mode, result.away.id, result.home.id, result.awayPitcher.id, result.homePitcher.id, awayScore, homeScore].join('|');
  if (!extremeKeys.has(extremeKey)) {
    extremeKeys.add(extremeKey);
    summary.extremeValidOutputs.push({
      totalRuns: combined,
      score: result.away.abbreviation + ' ' + awayScore + ', ' + result.home.abbreviation + ' ' + homeScore,
      mode,
      starters: result.awayPitcher.name + ' vs ' + result.homePitcher.name,
    });
  }
}

summary.averageHomeRunsScored = Number((homeRunTotal / totalSimulations).toFixed(2));
summary.averageAwayRunsScored = Number((awayRunTotal / totalSimulations).toFixed(2));
summary.averageTotalRunsScored = Number((summary.averageHomeRunsScored + summary.averageAwayRunsScored).toFixed(2));
summary.averageExpectedHomeRuns = Number((expectedHomeRunTotal / totalSimulations).toFixed(2));
summary.averageExpectedAwayRuns = Number((expectedAwayRunTotal / totalSimulations).toFixed(2));
summary.averageExpectedTotalRuns = Number((summary.averageExpectedHomeRuns + summary.averageExpectedAwayRuns).toFixed(2));
summary.percentageGamesAbove15TotalRuns = Number(((summary.gamesAbove15TotalRuns / totalSimulations) * 100).toFixed(2));
summary.percentageGamesAbove20TotalRuns = Number(((summary.gamesAbove20TotalRuns / totalSimulations) * 100).toFixed(2));
summary.percentageTeamScoresAbove15 = Number(((summary.teamScoresAbove15 / totalSimulations) * 100).toFixed(2));
summary.percentageTeamScoresAbove18 = Number(((summary.teamScoresAbove18 / totalSimulations) * 100).toFixed(2));
summary.percentageCombinedScoresAbove25 = Number(((summary.combinedScoresAbove25 / totalSimulations) * 100).toFixed(2));
summary.extremeValidOutputs = summary.extremeValidOutputs
  .sort((a, b) => b.totalRuns - a.totalRuns)
  .slice(0, 8);

if (summary.invalidOutputs) console.log(JSON.stringify(summary.invalidExamples, null, 2));
assert.strictEqual(summary.invalidOutputs, 0, 'realism batch has zero invalid outputs');
assert(summary.modeCounts.current > 0 && summary.modeCounts.historical > 0 && summary.modeCounts.mixed > 0, 'all simulator modes are represented');
// BOUNDS FROM REAL BASEBALL, measured over MLB 2022-2025:
//   19,468 team-games: 29 scored 19 or more (0.149%), 8 reached 21, the most 28
//    9,734 games:      19 totalled 26 or more (0.195%), 2 reached 31, the most 33
//
// The four assertions here previously demanded that NO team ever score 19 and
// NO game ever total 26. Real baseball does both, a couple of times a season,
// and so does a correct simulator. Over 900 simulations a handful is the
// EXPECTED result, and a suite that forbids them is asserting that the tails do
// not exist.
//
// What matters is the RATE, so that is what is checked. The ceilings are set
// just above the real record, where they still catch a runaway inning loop.
assert(summary.highestScoreObserved <= 30,
  'highest individual score ' + summary.highestScoreObserved + ' is beyond the real record of 28');
assert(summary.highestCombinedScoreObserved <= 36,
  'highest combined score ' + summary.highestCombinedScoreObserved + ' is beyond the real record of 33');

const teamGames = totalSimulations * 2;
const bigScoreRate = summary.teamScoresAbove18 / teamGames;
const bigTotalRate = summary.combinedScoresAbove25 / totalSimulations;
// Generous against the real 0.149% and 0.195%, because these are rare events and
// a small sample bounces. An engine running several times reality's rate is a
// tail problem worth failing over; matching it is not.
assert(bigScoreRate <= 0.012,
  'teams score 19+ in ' + (bigScoreRate * 100).toFixed(3) + '% of games, against 0.149% in real MLB');
assert(bigTotalRate <= 0.015,
  'games total 26+ in ' + (bigTotalRate * 100).toFixed(3) + '% of games, against 0.195% in real MLB');
assert(summary.averageHomeRunsScored >= 4.1 && summary.averageHomeRunsScored <= 5.2, 'home scoring average stays in MLB-like range');
assert(summary.averageAwayRunsScored >= 3.9 && summary.averageAwayRunsScored <= 5.0, 'away scoring average stays in MLB-like range');
assert(summary.averageTotalRunsScored >= 8.2 && summary.averageTotalRunsScored <= 9.8, 'total run average stays in realistic MLB range');
assert(summary.averageExpectedTotalRuns >= 8.0 && summary.averageExpectedTotalRuns <= 9.5, 'displayed expected-run average stays in realistic MLB range');
assert(summary.percentageGamesAbove15TotalRuns <= 3.5, 'high-total outlier rate stays controlled');
assert(summary.percentageGamesAbove20TotalRuns <= 0.5, '20+ run games stay rare');

console.log('mlb-simulator-realism-test: ok');
console.log(JSON.stringify(summary, null, 2));
