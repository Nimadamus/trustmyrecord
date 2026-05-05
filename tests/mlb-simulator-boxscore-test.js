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
  'boxScorePanel','boxScoreTitle','boxScoreBody','boxScoreSummary','copyBoxScoreButton','saveBoxScoreButton'
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
  simulator.state.awayTeamId = away.id;
  simulator.state.homeTeamId = home.id;
  simulator.state.awayPitcherId = simulator.pitcherOptionsFor(away, 'away', null)[1].id;
  simulator.state.homePitcherId = simulator.pitcherOptionsFor(home, 'home', null)[3].id;
  return simulator.simulate(away, home, null);
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
  assert(box.winner.id === (box.away.runs > box.home.runs ? result.away.id : result.home.id), 'winner matches line score');
}

(async () => {
  const { simulator, elements } = simulatorContext();
  ['current', 'historical', 'mixed'].forEach((mode, index) => {
    const result = chooseTeams(simulator, mode, index, index + 1);
    simulator.state.simulation = result;
    assertBoxScore(result);
    simulator.runSimulation();
    assert.strictEqual(elements.boxScorePanel.getAttribute('data-box-score-state'), 'projected', mode + ' renders box score panel');
    assert(/<tr/.test(elements.boxScoreBody.innerHTML), mode + ' renders box score rows');
    assert(/Starting Pitchers:/.test(simulator.boxScoreText(result)), mode + ' export includes starters');
    assert(/Projection notice: Simulation-based estimate/.test(simulator.boxScoreText(result)), mode + ' export includes honest projection notice');
  });
  simulator.copyBoxScore();
  await Promise.resolve();
  assert(/TrustMyRecord MLB Simulator Box Score/.test(clipboard), 'copy action writes box score text');
  simulator.saveBoxScore();
  assert(/^mlb-simulator-.*-box-score\.txt$/.test(savedFilename), 'save action downloads a clean text filename');
  console.log('mlb-simulator-boxscore-test: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
