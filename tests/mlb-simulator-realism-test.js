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
  'boxScoreMatchupCard','playerBoxScorePanel','playerBoxScoreContent','copyBoxScoreButton','saveBoxScoreButton'
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
  if (away.runs > 20 || home.runs > 20) invalid.push('individual score above hard cap');
  if (away.runs + home.runs > 30) invalid.push('combined score above hard cap');
  if (sum(away.innings) !== away.runs) invalid.push('away inning total mismatch');
  if (sum(home.innings) !== home.runs) invalid.push('home inning total mismatch');
  if (away.innings.length !== 9 || home.innings.length !== 9) invalid.push('box score does not have nine innings per side');
  if (away.hits < away.runs || home.hits < home.runs) invalid.push('hits lower than runs');
  if (away.hits > 25 || home.hits > 25) invalid.push('hits above plausible cap');
  if (away.errors < 0 || home.errors < 0) invalid.push('negative errors');
  if (away.errors > 4 || home.errors > 4) invalid.push('errors above plausible cap');
  if (away.runs === home.runs) invalid.push('simulation ended tied');
  if (result.boxScore.winner.id !== (away.runs > home.runs ? result.away.id : result.home.id)) invalid.push('winner does not match final score');
  if (result.winner.id !== (result.homeWin >= result.awayWin ? result.home.id : result.away.id)) invalid.push('projected winner does not match higher win probability');
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

const mlbTeamIds = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113, CLE: 114, COL: 115, DET: 116,
  HOU: 117, KC: 118, LAA: 108, LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, ATH: 133,
  PHI: 143, PIT: 134, SD: 135, SF: 137, SEA: 136, STL: 138, TB: 139, TEX: 140, TOR: 141, WSH: 120,
};

function preloadVerifiedRoster(simulator, team) {
  if (!team || team.era !== 'current') return;
  const teamId = mlbTeamIds[team.abbreviation];
  if (!teamId) return;
  const positions = ['CF', 'SS', 'RF', '1B', '3B', 'LF', 'DH', '2B', 'C'];
  const pitchers = ['SP', 'SP', 'SP', 'RP', 'RP'];
  simulator.state.liveContext.teamRosters[team.abbreviation] = {
    teamId: String(teamId),
    count: positions.length + pitchers.length,
    relievers: pitchers.length,
    source: 'Projected lineup from verified MLB active roster endpoint',
    summary: `${positions.length + pitchers.length} MLB active roster players`,
    uiBuild: simulator.uiBuild,
    players: positions.map((position, index) => ({
      name: `${team.abbreviation} Batter ${index + 1}`,
      position,
      teamId: String(teamId),
    })).concat(pitchers.map((position, index) => ({
      name: `${team.abbreviation} Pitcher ${index + 1}`,
      position,
      teamId: String(teamId),
    }))),
  };
}

function runCase(simulator, mode, away, home, awayPitcherIndex, homePitcherIndex, index) {
  simulator.state.preset = mode;
  simulator.state.awayPool = away.year === 'Current' ? 'current' : 'historical';
  simulator.state.homePool = home.year === 'Current' ? 'current' : 'historical';
  preloadVerifiedRoster(simulator, away);
  preloadVerifiedRoster(simulator, home);
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
const current = simulator.localTeams.current.slice();
const historical = simulator.localTeams.historical.slice();
const all = current.concat(historical);
const byStrength = (a, b) => ((b.offense + b.startingPitching + b.bullpen + b.runPrevention) - (a.offense + a.startingPitching + a.bullpen + a.runPrevention));
const currentStrong = current.slice().sort(byStrength);
const historicalStrong = historical.slice().sort(byStrength);
const currentWeak = currentStrong.slice().reverse();
const historicalWeak = historicalStrong.slice().reverse();

const totalSimulations = 12000;
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
summary.percentageGamesAbove15TotalRuns = Number(((summary.gamesAbove15TotalRuns / totalSimulations) * 100).toFixed(2));
summary.percentageGamesAbove20TotalRuns = Number(((summary.gamesAbove20TotalRuns / totalSimulations) * 100).toFixed(2));
summary.percentageTeamScoresAbove15 = Number(((summary.teamScoresAbove15 / totalSimulations) * 100).toFixed(2));
summary.percentageTeamScoresAbove18 = Number(((summary.teamScoresAbove18 / totalSimulations) * 100).toFixed(2));
summary.percentageCombinedScoresAbove25 = Number(((summary.combinedScoresAbove25 / totalSimulations) * 100).toFixed(2));
summary.extremeValidOutputs = summary.extremeValidOutputs
  .sort((a, b) => b.totalRuns - a.totalRuns)
  .slice(0, 8);

assert.strictEqual(summary.invalidOutputs, 0, 'realism batch has zero invalid outputs');
assert(summary.modeCounts.current > 0 && summary.modeCounts.historical > 0 && summary.modeCounts.mixed > 0, 'all simulator modes are represented');
assert(summary.highestScoreObserved <= 20, 'highest individual score stays under hard cap');
assert(summary.highestCombinedScoreObserved <= 30, 'highest combined score stays under hard cap');
assert.strictEqual(summary.teamScoresAbove18, 0, 'no team score exceeds extreme outlier threshold');
assert.strictEqual(summary.combinedScoresAbove25, 0, 'no combined score exceeds conservative high-total threshold');

console.log('mlb-simulator-realism-test: ok');
console.log(JSON.stringify(summary, null, 2));
