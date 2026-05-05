#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'mlb-simulator', 'index.html');
const scriptPath = path.join(root, 'static', 'js', 'mlb-simulator.js');

assert(fs.existsSync(pagePath), '/mlb-simulator/ page exists');
assert(fs.existsSync(scriptPath), 'MLB simulator client script exists');

const html = fs.readFileSync(pagePath, 'utf8');
const script = fs.readFileSync(scriptPath, 'utf8');

assert(/<link rel="canonical" href="https:\/\/trustmyrecord\.com\/mlb-simulator\/">/.test(html), 'canonical route is /mlb-simulator/');
assert(/awayTeamSelect/.test(html), 'Team A selector is present');
assert(/homeTeamSelect/.test(html), 'Team B selector is present');
assert(/awayPoolSelect/.test(html), 'Team A pool selector is present');
assert(/homePoolSelect/.test(html), 'Team B pool selector is present');
assert(/Run Simulation/.test(html), 'Run Simulation button is present');
assert(/Current vs Current/.test(html), 'current-current preset is present');
assert(/Classic vs Classic/.test(html), 'classic-classic preset is present');
assert(/Current vs Classic/.test(html), 'mixed preset is present');
assert(/Projected Winner/.test(html), 'visual result card is present');
assert(/simulator baselines/i.test(html), 'baseline explanation is present');
assert(/does not include injuries or confirmed lineups/.test(html), 'honest limitations text is present');
assert(!/Loading MLB games|Loading sportsbook board|Waiting for board data|Projection engine not connected yet/.test(html), 'old board-dependent placeholder text is removed');
assert(!/lock pick|locked pick|submit pick/i.test(html), 'page does not expose sportsbook submission actions');

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
    style: {},
    classList: {
      toggle() {},
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name];
    },
  };
}

const elementIds = [
  'awayTeamSelect',
  'homeTeamSelect',
  'awayPoolSelect',
  'homePoolSelect',
  'runSimulationButton',
  'refreshTeamsButton',
  'currentModeButton',
  'historicalModeButton',
  'mixedModeButton',
  'awayTeamMeta',
  'homeTeamMeta',
  'selectedMatchupTitle',
  'awayHeaderName',
  'homeHeaderName',
  'awayHeaderMeta',
  'homeHeaderMeta',
  'awayEraBadge',
  'homeEraBadge',
  'resultCard',
  'winnerBadge',
  'awayScoreLabel',
  'homeScoreLabel',
  'awayScoreBig',
  'homeScoreBig',
  'awayExpectedTile',
  'homeExpectedTile',
  'keyExplanationValue',
  'simDataSourceTitle',
  'simDataSourceDetail',
  'simBoardMessage',
  'projectionShell',
  'projectedScoreValue',
  'winProbabilityValue',
  'expectedRunsValue',
  'totalRangeValue',
  'runEnvironmentValue',
  'simulationConfidenceValue',
  'awayProbabilityLabel',
  'homeProbabilityLabel',
  'awayProbabilityValue',
  'homeProbabilityValue',
  'awayProbabilityBar',
  'homeProbabilityBar',
  'projectionNotice',
  'comparisonGrid',
  'inputSummary',
  'matchupNotes',
];

const elements = {};
elementIds.forEach((id) => { elements[id] = makeElement(id); });

const context = {
  window: {},
  document: {
    readyState: 'complete',
    getElementById(id) {
      return elements[id] || null;
    },
    addEventListener() {},
  },
  console,
  Math,
  Number,
};
context.window.document = context.document;

vm.runInNewContext(script, context);
const simulator = context.window.TMRMlbSimulator;

assert(simulator, 'simulator API is exposed for smoke tests');
assert.strictEqual(simulator.localTeams.current.length, 30, '30 current teams are available locally');
assert.strictEqual(simulator.localTeams.historical.length, 20, '20 curated historical teams are available locally');
assert(/Arizona Diamondbacks/.test(elements.awayTeamSelect.innerHTML), 'current teams render into Team A selector');
assert(/Atlanta Braves/.test(elements.homeTeamSelect.innerHTML), 'current teams render into Team B selector');
assert.strictEqual(elements.awayPoolSelect.value, 'current', 'Team A starts in current pool');
assert.strictEqual(elements.homePoolSelect.value, 'current', 'Team B starts in current pool');
assert.strictEqual(elements.awayTeamSelect.disabled, false, 'Team A selector is immediately usable');
assert.strictEqual(elements.homeTeamSelect.disabled, false, 'Team B selector is immediately usable');
assert.strictEqual(elements.runSimulationButton.disabled, false, 'Run Simulation is enabled with default teams');

simulator.runSimulation();

assert.strictEqual(elements.projectionShell.getAttribute('data-projection-state'), 'projected', 'run simulation renders projected state');
assert.strictEqual(elements.resultCard.getAttribute('data-result-state'), 'projected', 'visual result card renders projected state');
assert(!/--/.test(elements.projectedScoreValue.textContent), 'score range renders after simulation');
assert(/%/.test(elements.winProbabilityValue.textContent), 'estimated win percentage renders after simulation');
assert(/%/.test(elements.winnerBadge.textContent), 'projected winner tile includes win probability');
assert(/Expected runs/.test(elements.awayExpectedTile.textContent), 'Team A expected runs render in result card');
assert(/Expected runs/.test(elements.homeExpectedTile.textContent), 'Team B expected runs render in result card');
assert(/projects ahead|composite team rating/.test(elements.keyExplanationValue.textContent), 'key explanation renders');
assert(/Simulation-based estimate, not sportsbook odds or provider projection/.test(elements.projectionNotice.textContent), 'disclaimer is explicit');
assert(/Not used \/ not invented/.test(elements.inputSummary.innerHTML), 'sportsbook odds are not shown as real inputs');
assert(/Not used for this estimate/.test(elements.inputSummary.innerHTML), 'SportsDataIO data is not shown as a real input');
assert(/Official records/.test(elements.inputSummary.innerHTML), 'record isolation is visible');
assert(/Offense/.test(elements.comparisonGrid.innerHTML), 'team comparison renders');

elements.historicalModeButton.listeners.click();
assert(/1927 New York Yankees/.test(elements.awayTeamSelect.innerHTML), 'historical teams render after tab switch');
assert(/2023 Texas Rangers/.test(elements.homeTeamSelect.innerHTML), 'full historical list is present');

elements.mixedModeButton.listeners.click();
assert.strictEqual(elements.awayPoolSelect.value, 'current', 'mixed mode keeps Team A current');
assert.strictEqual(elements.homePoolSelect.value, 'historical', 'mixed mode sets Team B historical');
assert(/Arizona Diamondbacks/.test(elements.awayTeamSelect.innerHTML), 'mixed mode Team A has current teams');
assert(/1927 New York Yankees/.test(elements.homeTeamSelect.innerHTML), 'mixed mode Team B has historical teams');
simulator.runSimulation();
assert.strictEqual(elements.projectionShell.getAttribute('data-projection-state'), 'projected', 'mixed matchup can run simulation');
assert(/%/.test(elements.winProbabilityValue.textContent), 'mixed matchup win probability renders');

console.log('mlb-simulator-page-test: ok');
