#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'static', 'js', 'mlb-simulator.js'), 'utf8');

const ids = [
  'awayTeamSelect','homeTeamSelect','awayPoolSelect','homePoolSelect','runSimulationButton','refreshTeamsButton',
  'awayPitcherSelect','homePitcherSelect','awayPitcherMeta','homePitcherMeta','awayPickerIdentity','homePickerIdentity',
  'awayHeaderLogo','homeHeaderLogo','awayScoreLogo','homeScoreLogo','currentModeButton','historicalModeButton',
  'mixedModeButton','modeHelpText','dataModeBadge','dataModeDetail','liveInputGrid','awayTeamMeta','homeTeamMeta',
  'selectedMatchupTitle','awayHeaderName','homeHeaderName','awayHeaderMeta','homeHeaderMeta','awayEraBadge',
  'homeEraBadge','resultCard','winnerBadge','awayScoreLabel','homeScoreLabel','awayScoreBig','homeScoreBig',
  'awayExpectedTile','homeExpectedTile','keyExplanationValue','simDataSourceTitle','simDataSourceDetail',
  'simBoardMessage','projectionShell','projectedScoreValue','winProbabilityValue','expectedRunsValue',
  'totalRangeValue','runEnvironmentValue','simulationConfidenceValue','eraAdjustmentValue','simulationModeValue',
  'dataModeValue','awayProbabilityLabel','homeProbabilityLabel','awayProbabilityValue','homeProbabilityValue',
  'awayProbabilityBar','homeProbabilityBar','projectionNotice','comparisonGrid','inputSummary','matchupNotes',
  'boxScorePanel','boxScoreTitle','boxScoreBody','boxScoreTeamTotals','boxScoreSummary','playerBoxScorePanel',
  'playerBoxScoreContent','copyBoxScoreButton','saveBoxScoreButton'
];

let clipboard = '';
let savedFilename = '';

function element(id) {
  return {
    id,
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
    attributes: {},
    listeners: {},
    style: { setProperty(name, value) { this[name] = value; } },
    classList: { toggle() {} },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
  };
}

function simulatorContext() {
  const elements = {};
  ids.forEach((id) => { elements[id] = element(id); });
  const context = {
    window: { URL: { createObjectURL() { return 'blob:box-score'; }, revokeObjectURL() {} } },
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      addEventListener() {},
      createElement(tag) {
        assert.strictEqual(tag, 'a');
        return { href: '', download: '', click() { savedFilename = this.download; } };
      },
      body: { appendChild() {}, removeChild() {} },
    },
    console,
    Math,
    Number,
    Date,
    Promise,
    Blob: class Blob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    },
    navigator: { clipboard: { writeText(value) { clipboard = value; return Promise.resolve(); } } },
    fetch: () => Promise.reject(new Error('network unavailable')),
    CONFIG: { api: { baseUrl: 'https://trustmyrecord-api.onrender.com/api' } },
  };
  context.window.document = context.document;
  vm.runInNewContext(script, context);
  return { simulator: context.window.TMRMlbSimulator, elements };
}

function chooseTeams(simulator, mode, awayIndex, homeIndex) {
  simulator.state.preset = mode;
  simulator.state.awayPool = mode === 'historical' ? 'historical' : 'current';
  simulator.state.homePool = mode === 'current' ? 'current' : 'historical';
  const awayTeams = simulator.state.awayPool === 'current' ? simulator.localTeams.current : simulator.localTeams.historical;
  const homeTeams = simulator.state.homePool === 'current' ? simulator.localTeams.current : simulator.localTeams.historical;
  const away = awayTeams[awayIndex % awayTeams.length];
  const home = homeTeams[homeIndex % homeTeams.length];
  preloadVerifiedRoster(simulator, away);
  preloadVerifiedRoster(simulator, home);
  simulator.state.awayTeamId = away.id;
  simulator.state.homeTeamId = home.id;
  simulator.state.awayPitcherId = simulator.pitcherOptionsFor(away, 'away', null)[1].id;
  simulator.state.homePitcherId = simulator.pitcherOptionsFor(home, 'home', null)[3].id;
  return simulator.simulate(away, home, null);
}

const teamIds = { ARI: 109, ATL: 144, BAL: 110 };
const rosterNames = {
  ARI: ['Corbin Carroll|RF', 'Ketel Marte|2B', 'Gabriel Moreno|C', 'Geraldo Perdomo|SS', 'Alek Thomas|CF', 'Lourdes Gurriel Jr.|LF', 'Ildemaro Vargas|1B', 'Tim Tawa|3B', 'Jorge Barrosa|LF', 'Zac Gallen|P', 'Brandon Pfaadt|P', 'Eduardo Rodriguez|P', 'Merrill Kelly|P', 'Ryne Nelson|P'],
  ATL: ['Michael Harris II|CF', 'Ozzie Albies|2B', 'Austin Riley|3B', 'Matt Olson|1B', 'Drake Baldwin|C', 'Jurickson Profar|LF', 'Eli White|RF', 'Nacho Alvarez Jr.|SS', 'Dominic Smith|DH', 'Chris Sale|P', 'Spencer Strider|P', 'Bryce Elder|P', 'Grant Holmes|P', 'Raisel Iglesias|P'],
  BAL: ['Gunnar Henderson|SS', 'Adley Rutschman|C', 'Jackson Holliday|2B', 'Ryan Mountcastle|1B', 'Colton Cowser|LF', 'Jordan Westburg|3B', 'Cedric Mullins|CF', 'Heston Kjerstad|RF', 'Ryan O Hearn|DH', 'Kyle Bradish|P', 'Dean Kremer|P', 'Trevor Rogers|P', 'Shane Baz|P', 'Chris Bassitt|P'],
};

function preloadVerifiedRoster(simulator, team) {
  if (!team || team.era !== 'current') return;
  const id = teamIds[team.abbreviation];
  const names = rosterNames[team.abbreviation];
  if (!id || !names) return;
  simulator.state.liveContext.teamRosters[team.abbreviation] = {
    teamId: String(id),
    count: names.length,
    relievers: 3,
    source: 'Verified MLB active roster endpoint',
    summary: `${names.length} MLB active roster players`,
    uiBuild: simulator.uiBuild,
    players: names.map((entry) => {
      const [name, position] = entry.split('|');
      return { name, position, teamId: String(id) };
    }),
  };
}

function assertBoxScore(result) {
  const box = result.boxScore;
  const awayTotal = box.away.innings.reduce((total, run) => total + run, 0);
  const homeTotal = box.home.innings.reduce((total, run) => total + run, 0);
  assert.strictEqual(awayTotal, box.away.runs, 'away inning runs add to final score');
  assert.strictEqual(homeTotal, box.home.runs, 'home inning runs add to final score');
  assert.strictEqual(box.away.innings.length, 9, 'away has nine innings');
  assert.strictEqual(box.home.innings.length, 9, 'home has nine innings');
  assert(box.away.runs <= 20 && box.home.runs <= 20, 'individual runs remain capped');
  assert(box.away.runs + box.home.runs <= 30, 'combined runs remain capped');
  assert(box.away.hits >= box.away.runs && box.home.hits >= box.home.runs, 'hits are compatible with runs');
  assert(box.away.hits <= 25 && box.home.hits <= 25, 'hits remain plausible');
  assert(box.away.errors <= 4 && box.home.errors <= 4, 'errors remain plausible');
  [box.away, box.home].forEach((line) => {
    assert(line.summaryStats, 'team summary stats exist');
    ['doubles', 'triples', 'homeRuns', 'rbi', 'walks', 'strikeouts', 'stolenBases', 'caughtStealing', 'leftOnBase', 'totalPitches', 'totalStrikes', 'hits', 'runs', 'errors'].forEach((key) => {
      assert(Number.isFinite(line.summaryStats[key]), `${key} is numeric`);
    });
    assert(line.summaryStats.totalPitches >= line.summaryStats.totalStrikes, 'pitches are greater than or equal to strikes');
    assert(line.summaryStats.hits === line.hits, 'summary hits mirror line score');
    assert(line.summaryStats.runs === line.runs, 'summary runs mirror line score');
    assert(line.summaryStats.errors === line.errors, 'summary errors mirror line score');
  });
  assert(box.winner.id === (box.away.runs > box.home.runs ? result.away.id : result.home.id), 'winner matches line score');
  assert(result.winner.id === (result.homeWin >= result.awayWin ? result.home.id : result.away.id), 'projected winner matches higher win probability');
}

(async () => {
  const { simulator, elements } = simulatorContext();
  const modes = ['current', 'historical', 'mixed'];
  for (let index = 0; index < modes.length; index += 1) {
    const mode = modes[index];
    const result = chooseTeams(simulator, mode, index, index + 1);
    simulator.state.simulation = result;
    assertBoxScore(result);
    await simulator.runSimulation();
    assert.strictEqual(elements.boxScorePanel.getAttribute('data-box-score-state'), 'projected', mode + ' renders box score panel');
    assert(/<tr/.test(elements.boxScoreBody.innerHTML), mode + ' renders box score rows');
    assert(/LOB/.test(elements.boxScoreTeamTotals.innerHTML), mode + ' renders left on base totals');
    assert(/P-S/.test(elements.boxScoreTeamTotals.innerHTML), mode + ' renders pitches-strikes totals');
    assert(/<th>2B<\/th>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders doubles column');
    assert(/<th>3B<\/th>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders triples column');
    assert(/<th>HR<\/th>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders home run column');
    assert(/<th>SB<\/th>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders stolen base column');
    assert(/<th>CS<\/th>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders caught stealing column');
    assert(/<th>NP<\/th>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders total pitches column');
    assert(/<th>P-S<\/th>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders pitches-strikes column');
    assert(/Starting Pitchers:/.test(simulator.boxScoreText(result)), mode + ' export includes starters');
    assert(/Team summary:/.test(simulator.boxScoreText(result)), mode + ' export includes team summary stats');
    assert(/LOB/.test(simulator.boxScoreText(result)), mode + ' export includes left on base');
    assert(/Pitches/.test(simulator.boxScoreText(result)), mode + ' export includes total pitches');
    assert(/Generated: \d{4}-\d{2}-\d{2}T/.test(simulator.boxScoreText(result)), mode + ' export includes generated timestamp');
    assert(/Simulated final:/.test(simulator.boxScoreText(result)), mode + ' export includes simulated final score');
    assert(/Win probability:/.test(simulator.boxScoreText(result)), mode + ' export includes win probability');
    assert(/Expected runs:/.test(simulator.boxScoreText(result)), mode + ' export includes expected runs');
    assert(/Matchup notes:/.test(simulator.boxScoreText(result)), mode + ' export includes matchup notes');
    assert(/Projection notice: Simulation-based estimate/.test(simulator.boxScoreText(result)), mode + ' export includes honest projection notice');
  }
  simulator.copyBoxScore();
  await Promise.resolve();
  assert(/TrustMyRecord MLB Simulator Box Score/.test(clipboard), 'copy action writes box score text');
  simulator.saveBoxScore();
  assert(/^trustmyrecord-mlb-simulator-box-score-.*-\d{4}-\d{2}-\d{2}\.txt$/.test(savedFilename), 'save action downloads a clean dated text filename');
  console.log('mlb-simulator-boxscore-test: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
