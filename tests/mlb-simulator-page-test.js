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
assert(/awayPitcherOptions/.test(html), 'Team A visible pitcher options are present');
assert(/homePitcherOptions/.test(html), 'Team B visible pitcher options are present');
assert(/Starting pitcher options/.test(html), 'starting pitcher option controls are labeled');
assert(!/Select team first/.test(html), 'empty pitcher dropdown copy is removed');
assert(/Run Simulation/.test(html), 'Run Simulation button is present');
assert(/Current Teams/.test(html), 'current-team preset is present');
assert(/Classic Teams/.test(html), 'classic-team preset is present');
assert(/Mixed Era Matchup/.test(html), 'mixed-era preset is present');
assert(/Data Mode/.test(html), 'data mode status area is present');
assert(/MLB schedule\/finals/.test(html), 'schedule/finals slot is present');
assert(/Team records/.test(html), 'team records slot is present');
assert(/Probable starters/.test(html), 'probable starter slot is present');
assert(/Confirmed starter status/.test(html), 'confirmed starter slot is present');
assert(/Ballpark/.test(html), 'ballpark slot is present');
assert(/Weather/.test(html), 'weather slot is present');
assert(/Sportsbook odds/.test(html), 'sportsbook odds slot is present');
assert(/Injury report/.test(html), 'injury report slot is present');
assert(/Roster context/.test(html), 'roster context slot is present');
assert(/Recent scoring form/.test(html), 'recent scoring form slot is present');
assert(/Bullpen context/.test(html), 'bullpen context slot is present');
assert(/Verified live inputs appear only when matched; unavailable roster lists, confirmed starter status, bullpen workload, and betting-edge claims are not used/.test(html), 'honest limitations text is present');
assert(!/Loading MLB games|Loading sportsbook board|Waiting for board data|Projection engine not connected yet|Not connected for custom simulation|Unavailable without real inputs/.test(html), 'old board-dependent placeholder text is removed');
assert(!/lock pick|locked pick|submit pick/i.test(html), 'page does not expose sportsbook submission actions');
assert(!/live verified|official injury/i.test(html), 'page does not include fake live data claims');

const elementIds = [
  'awayTeamSelect','homeTeamSelect','awayPoolSelect','homePoolSelect','runSimulationButton','refreshTeamsButton',
  'awayPitcherOptions','homePitcherOptions','awayPitcherMeta','homePitcherMeta',
  'currentModeButton','historicalModeButton','mixedModeButton','modeHelpText','dataModeBadge','dataModeDetail',
  'liveInputGrid','awayTeamMeta','homeTeamMeta','selectedMatchupTitle','awayHeaderName','homeHeaderName',
  'awayHeaderMeta','homeHeaderMeta','awayEraBadge','homeEraBadge','resultCard','winnerBadge','awayScoreLabel',
  'homeScoreLabel','awayScoreBig','homeScoreBig','awayExpectedTile','homeExpectedTile','keyExplanationValue',
  'simDataSourceTitle','simDataSourceDetail','simBoardMessage','projectionShell','projectedScoreValue',
  'winProbabilityValue','expectedRunsValue','totalRangeValue','runEnvironmentValue','simulationConfidenceValue',
  'eraAdjustmentValue','simulationModeValue','dataModeValue','awayProbabilityLabel','homeProbabilityLabel',
  'awayProbabilityValue','homeProbabilityValue','awayProbabilityBar','homeProbabilityBar','projectionNotice',
  'comparisonGrid','inputSummary','matchupNotes'
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
    style: {},
    classList: { toggle() {} },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
  };
}

function mockResponse(data) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function buildFetchMock(mode) {
  return (url) => {
    if (mode === 'unavailable') return Promise.reject(new Error('network unavailable'));
    if (String(url).includes('/games?sport=baseball_mlb')) {
      return mockResponse({
        games: [{
          id: 'espn_401815218',
          sport_key: 'baseball_mlb',
          home_team: 'New York Yankees',
          away_team: 'Texas Rangers',
          commence_time: '2026-05-05T23:05:00.000Z',
          completed: false,
        }],
      });
    }
    if (String(url).includes('/games/board/baseball_mlb')) {
      return mockResponse({
        games: [{
          id: 'board_401815218',
          sport_key: 'baseball_mlb',
          home_team: 'New York Yankees',
          away_team: 'Texas Rangers',
          updated_at: '2026-05-05T05:04:03.538Z',
          bookmakers: [{
            key: 'draftkings',
            title: 'DraftKings',
            markets: [
              { key: 'h2h', outcomes: [{ name: 'New York Yankees', price: -140 }, { name: 'Texas Rangers', price: 118 }] },
              { key: 'totals', outcomes: [{ name: 'Over', point: 8.5, price: -110 }, { name: 'Under', point: 8.5, price: -110 }] },
            ],
          }],
        }],
      });
    }
    if (String(url).includes('site.api.espn.com')) {
      if (String(url).includes('/summary?event=401815218')) {
        return mockResponse({
          injuries: [
            {
              team: { displayName: 'New York Yankees' },
              injuries: [
                { status: '15-Day-IL', athlete: { displayName: 'Yankees Reliever', position: { abbreviation: 'RP' }, status: { abbreviation: '15-Day-IL' } }, details: { type: 'Shoulder' } },
                { status: 'Day-To-Day', athlete: { displayName: 'Yankees Outfielder', position: { abbreviation: 'CF' }, status: { abbreviation: 'Day-To-Day' } }, details: { type: 'Knee' } },
              ],
            },
            {
              team: { displayName: 'Texas Rangers' },
              injuries: [
                { status: '10-Day-IL', athlete: { displayName: 'Rangers Infielder', position: { abbreviation: '2B' }, status: { abbreviation: '10-Day-IL' } }, details: { type: 'Wrist' } },
              ],
            },
          ],
          rosters: [
            { homeAway: 'home', team: { displayName: 'New York Yankees' } },
            { homeAway: 'away', team: { displayName: 'Texas Rangers' } },
          ],
        });
      }
      const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      if (!String(url).includes('dates=' + todayKey)) {
        return mockResponse({
          events: [
            {
              id: 'recent_tex_1',
              date: '2026-05-03T20:10Z',
              status: { type: { completed: true, shortDetail: 'Final' } },
              competitions: [{
                competitors: [
                  { homeAway: 'home', score: '3', team: { displayName: 'Boston Red Sox' } },
                  { homeAway: 'away', score: '6', team: { displayName: 'Texas Rangers' } },
                ],
              }],
            },
            {
              id: 'recent_nyy_1',
              date: '2026-05-03T17:05Z',
              status: { type: { completed: true, shortDetail: 'Final' } },
              competitions: [{
                competitors: [
                  { homeAway: 'home', score: '9', team: { displayName: 'New York Yankees' } },
                  { homeAway: 'away', score: '4', team: { displayName: 'Baltimore Orioles' } },
                ],
              }],
            },
          ],
        });
      }
      return mockResponse({
        events: [{
          id: '401815218',
          date: '2026-05-05T23:05Z',
          weather: { displayValue: 'Clear', temperature: 81, gust: 14, precipitation: 0 },
          status: { type: { completed: false, shortDetail: '5/5 - 7:05 PM EDT' } },
          competitions: [{
            venue: { fullName: 'Yankee Stadium', address: { city: 'Bronx', state: 'New York' }, indoor: false },
            competitors: [
              {
                homeAway: 'home',
                score: '0',
                team: { displayName: 'New York Yankees' },
                records: [{ name: 'overall', type: 'total', summary: '21-13' }],
                probables: [{ athlete: { displayName: 'Gerrit Cole' }, record: '(3-1, 2.88)', statistics: [{ abbreviation: 'ERA', displayValue: '2.88' }] }],
              },
              {
                homeAway: 'away',
                score: '0',
                team: { displayName: 'Texas Rangers' },
                records: [{ name: 'overall', type: 'total', summary: '17-17' }],
                probables: [{ athlete: { displayName: 'Jacob deGrom' }, record: '(2-1, 3.20)', statistics: [{ abbreviation: 'ERA', displayValue: '3.20' }] }],
              },
            ],
          }],
        }],
      });
    }
    return Promise.reject(new Error('unexpected URL ' + url));
  };
}

function createSimulator(fetchMode) {
  const elements = {};
  elementIds.forEach((id) => { elements[id] = makeElement(id); });
  const context = {
    window: {},
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      addEventListener() {},
    },
    console,
    Math,
    Number,
    Date,
    Promise,
    fetch: buildFetchMock(fetchMode),
    CONFIG: { api: { baseUrl: 'https://trustmyrecord-api.onrender.com/api' } },
  };
  context.window.document = context.document;
  vm.runInNewContext(script, context);
  return { simulator: context.window.TMRMlbSimulator, elements };
}

function optionValue(selectHtml, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = selectHtml.match(new RegExp('<option value="([^"]+)">' + escaped + '</option>'));
  assert(match, 'option exists: ' + label);
  return match[1];
}

function choose(elements, awayLabel, homeLabel) {
  elements.awayTeamSelect.value = optionValue(elements.awayTeamSelect.innerHTML, awayLabel);
  elements.awayTeamSelect.listeners.change();
  elements.homeTeamSelect.value = optionValue(elements.homeTeamSelect.innerHTML, homeLabel);
  elements.homeTeamSelect.listeners.change();
}

function choosePitchers(elements, awayLabel, homeLabel) {
  const awayId = pitcherChoiceId(elements.awayPitcherOptions.innerHTML, awayLabel);
  const homeId = pitcherChoiceId(elements.homePitcherOptions.innerHTML, homeLabel);
  elements.awayPitcherOptions.listeners.click({ target: pitcherClickTarget(awayId) });
  elements.homePitcherOptions.listeners.click({ target: pitcherClickTarget(homeId) });
}

function pitcherChoiceId(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cards = html.match(/<button[\s\S]*?<\/button>/g) || [];
  const card = cards.filter((item) => new RegExp('<strong>' + escaped + '</strong>').test(item))[0];
  assert(card, 'pitcher option exists: ' + label);
  const match = card.match(/data-pitcher-id="([^"]+)"/);
  assert(match, 'pitcher option id exists: ' + label);
  return match[1];
}

function pitcherClickTarget(id) {
  return {
    closest(selector) {
      if (selector !== '[data-pitcher-id]') return null;
      return { getAttribute(name) { return name === 'data-pitcher-id' ? id : null; } };
    },
  };
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

(async () => {
  const fallback = createSimulator('unavailable');
  const simulator = fallback.simulator;
  const elements = fallback.elements;

  assert(simulator, 'simulator API is exposed for smoke tests');
  await flushAsync();
  assert.strictEqual(simulator.localTeams.current.length, 30, '30 current teams are available locally');
  assert.strictEqual(simulator.localTeams.historical.length, 20, '20 curated historical teams are available locally');
  assert.strictEqual(simulator.liveInputs.length, 11, 'live input architecture exposes eleven source slots');
  assert.strictEqual((elements.awayPitcherOptions.innerHTML.match(/class="pitcher-choice/g) || []).length, 5, 'Team A shows five visible pitcher options');
  assert.strictEqual((elements.homePitcherOptions.innerHTML.match(/class="pitcher-choice/g) || []).length, 5, 'Team B shows five visible pitcher options');
  assert(/ARI Ace profile/.test(elements.awayPitcherOptions.innerHTML), 'current ace simulator profile renders');
  assert(/ATL Above average starter/.test(elements.homePitcherOptions.innerHTML), 'current above-average simulator profile renders');
  assert(/League average starter/.test(elements.homePitcherOptions.innerHTML), 'current league-average simulator profile renders');
  assert(/Back end starter/.test(elements.homePitcherOptions.innerHTML), 'current back-end simulator profile renders');
  assert(/Bullpen game/.test(elements.homePitcherOptions.innerHTML), 'current bullpen-game simulator profile renders');
  assert.strictEqual(elements.dataModeBadge.textContent, 'Baseline ratings', 'baseline data mode is explicit by default');
  assert(/Verified live inputs are unavailable/.test(elements.dataModeDetail.textContent), 'live input unavailability is explicit');
  assert(/MLB schedule\/finals/.test(elements.liveInputGrid.innerHTML), 'live input grid renders schedule/finals');
  assert(/Team records/.test(elements.liveInputGrid.innerHTML), 'live input grid renders team records');
  assert(/Probable starters/.test(elements.liveInputGrid.innerHTML), 'live input grid renders probable starters');
  assert(/Confirmed starter status/.test(elements.liveInputGrid.innerHTML), 'live input grid renders confirmed starter status');
  assert(/Ballpark/.test(elements.liveInputGrid.innerHTML), 'live input grid renders ballpark');
  assert(/Weather/.test(elements.liveInputGrid.innerHTML), 'live input grid renders weather');
  assert(/Sportsbook odds/.test(elements.liveInputGrid.innerHTML), 'live input grid renders sportsbook odds');
  assert(/Injury report/.test(elements.liveInputGrid.innerHTML), 'live input grid renders injury report');
  assert(/Recent scoring form/.test(elements.liveInputGrid.innerHTML), 'live input grid renders recent scoring form');
  assert(!/Connected|Available<\/span>/.test(elements.liveInputGrid.innerHTML), 'unverified live inputs are not shown as connected');

  simulator.runSimulation();
  assert.strictEqual(elements.resultCard.getAttribute('data-result-state'), 'projected', 'fallback run renders projected state');
  assert(/%/.test(elements.winProbabilityValue.textContent), 'estimated win percentage renders after simulation');
  assert(/Starting pitchers/.test(elements.inputSummary.innerHTML), 'output includes selected starters row');
  assert(/ARI Ace profile|ATL Ace profile/.test(elements.matchupNotes.innerHTML), 'output notes include selected current starter profile names');
  assert.strictEqual(elements.dataModeValue.textContent, 'Baseline ratings', 'fallback output states baseline data mode');
  const baselineScore = elements.expectedRunsValue.textContent;
  choosePitchers(elements, 'ARI Back end starter', 'ATL Ace profile');
  simulator.runSimulation();
  assert.notStrictEqual(elements.expectedRunsValue.textContent, baselineScore, 'changing selected current starters changes projection');
  assert(/Simulation-based estimate, not sportsbook odds or provider projection/.test(elements.projectionNotice.textContent), 'fallback disclaimer is explicit');
  assert(/Sportsbook odds/.test(elements.inputSummary.innerHTML), 'missing sportsbook data is shown cleanly');
  assert(!/DraftKings|FanDuel|BetMGM|live verified|official injury/i.test([
    elements.simBoardMessage.textContent,
    elements.projectionNotice.textContent,
    elements.inputSummary.innerHTML,
    elements.matchupNotes.innerHTML,
  ].join(' ')), 'fallback rendered simulator avoids fake live data claims');

  elements.historicalModeButton.listeners.click();
  assert(/1927 New York Yankees/.test(elements.awayTeamSelect.innerHTML), 'historical teams render after tab switch');
  assert(/2023 Texas Rangers/.test(elements.homeTeamSelect.innerHTML), 'full historical list is present');
  assert(/Waite Hoyt/.test(elements.awayPitcherOptions.innerHTML), 'historical pitcher options render');
  assert.strictEqual((elements.awayPitcherOptions.innerHTML.match(/class="pitcher-choice/g) || []).length, 5, 'historical Team A shows five visible pitcher options');
  assert.strictEqual((elements.homePitcherOptions.innerHTML.match(/class="pitcher-choice/g) || []).length, 5, 'historical Team B shows five visible pitcher options');
  assert(/Historical simulator input/.test(elements.awayPitcherMeta.textContent), 'historical pitcher meta labels modeled source');
  simulator.runSimulation();
  assert(/Classic baseline/.test(elements.simulationModeValue.textContent), 'classic matchup reports classic simulation mode');
  assert(/Waite Hoyt|Red Ruffing/.test(elements.matchupNotes.innerHTML), 'classic output includes historical starter names');

  elements.mixedModeButton.listeners.click();
  assert.strictEqual(elements.awayPoolSelect.value, 'current', 'mixed mode keeps Team A current');
  assert.strictEqual(elements.homePoolSelect.value, 'historical', 'mixed mode sets Team B historical');
  assert(/ARI Ace profile/.test(elements.awayPitcherOptions.innerHTML), 'mixed mode current pitcher options render');
  assert(/Red Ruffing/.test(elements.homePitcherOptions.innerHTML), 'mixed mode historical pitcher options render');
  assert.strictEqual((elements.awayPitcherOptions.innerHTML.match(/class="pitcher-choice/g) || []).length, 5, 'mixed Team A shows five visible pitcher options');
  assert.strictEqual((elements.homePitcherOptions.innerHTML.match(/class="pitcher-choice/g) || []).length, 5, 'mixed Team B shows five visible pitcher options');
  simulator.runSimulation();
  assert.strictEqual(elements.projectionShell.getAttribute('data-projection-state'), 'projected', 'mixed matchup can run simulation');
  assert(/Mixed-era baseline/.test(elements.simulationModeValue.textContent), 'mixed matchup reports mixed-era simulation mode');
  assert(/Starting Pitchers/.test(elements.matchupNotes.innerHTML), 'mixed output includes selected starter section');

  const live = createSimulator('available');
  await live.simulator.loadLiveContext();
  choose(live.elements, 'Texas Rangers', 'New York Yankees');
  assert.strictEqual((live.elements.awayPitcherOptions.innerHTML.match(/class="pitcher-choice/g) || []).length, 5, 'live Team A shows five visible pitcher options');
  assert.strictEqual((live.elements.homePitcherOptions.innerHTML.match(/class="pitcher-choice/g) || []).length, 5, 'live Team B shows five visible pitcher options');
  assert(/Jacob deGrom/.test(live.elements.awayPitcherOptions.innerHTML) && /Verified probable starter/.test(live.elements.awayPitcherOptions.innerHTML), 'live probable away starter appears as a selectable verified pitcher');
  assert(/Gerrit Cole/.test(live.elements.homePitcherOptions.innerHTML) && /Verified probable starter/.test(live.elements.homePitcherOptions.innerHTML), 'live probable home starter appears as a selectable verified pitcher');
  live.simulator.runSimulation();
  assert.strictEqual(live.elements.dataModeBadge.textContent, 'Verified live inputs', 'live path switches data mode');
  assert.strictEqual(live.elements.dataModeValue.textContent, 'Verified live inputs', 'live output states verified data mode');
  assert(/MLB schedule\/finals/.test(live.elements.inputSummary.innerHTML), 'live path includes schedule/finals source');
  assert(/Team records/.test(live.elements.inputSummary.innerHTML), 'live path includes team records source');
  assert(/Probable starters/.test(live.elements.inputSummary.innerHTML), 'live path includes probable starter source');
  assert(/Confirmed starter status/.test(live.elements.inputSummary.innerHTML), 'live path lists confirmed starter status as missing');
  assert(/Ballpark/.test(live.elements.inputSummary.innerHTML), 'live path includes ballpark source');
  assert(/Weather/.test(live.elements.inputSummary.innerHTML), 'live path includes weather source');
  assert(/Sportsbook odds/.test(live.elements.inputSummary.innerHTML), 'live path includes sportsbook source when verified');
  assert(/Injury report/.test(live.elements.inputSummary.innerHTML), 'live path includes injury report source');
  assert(/Roster context/.test(live.elements.inputSummary.innerHTML), 'live path labels missing roster context');
  assert(/Bullpen context/.test(live.elements.inputSummary.innerHTML), 'live path includes bullpen context from reliever injuries');
  assert(/Recent scoring form/.test(live.elements.inputSummary.innerHTML), 'live path includes recent scoring form source');
  assert(/Recent scoring form from ESPN finals/.test(live.elements.matchupNotes.innerHTML), 'live path factors recent final scores');
  assert(/Gerrit Cole|Jacob deGrom|Yankee Stadium|Weather context from ESPN|ESPN injury report|Bullpen context is limited/.test(live.elements.matchupNotes.innerHTML), 'live path renders verified context as factors');
  assert(/Starting Pitchers:/.test(live.elements.matchupNotes.innerHTML) && /Jacob deGrom/.test(live.elements.matchupNotes.innerHTML) && /Gerrit Cole/.test(live.elements.matchupNotes.innerHTML), 'live output shows selected verified probable starters');
  const liveExpectedRuns = live.elements.expectedRunsValue.textContent;
  choosePitchers(live.elements, 'TEX Back end starter', 'Gerrit Cole');
  live.simulator.runSimulation();
  assert.notStrictEqual(live.elements.expectedRunsValue.textContent, liveExpectedRuns, 'changing selected live/manual starter changes projection');
  assert(/TEX Back end starter/.test(live.elements.matchupNotes.innerHTML), 'manual selected current starter profile is shown in output');
  assert(!/verified betting edge|official injury/i.test(live.elements.matchupNotes.innerHTML), 'live path does not claim fake edges or injuries');

  console.log('mlb-simulator-page-test: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
