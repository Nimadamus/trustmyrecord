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
assert(/\/static\/css\/mlb-simulator\.css\?v=20260507-realism-rosters/.test(html), 'live page uses versioned simulator stylesheet');
assert(/\/static\/js\/mlb-simulator\.js\?v=20260508-roster-full-guard/.test(html), 'live page uses versioned simulator script');
assert(/awayTeamSelect/.test(html), 'Team A selector is present');
assert(/homeTeamSelect/.test(html), 'Team B selector is present');
assert(/id="awayPitcherSelect" class="sim-select starter-select pitcher-select"/.test(html), 'Team A starter select uses the same styled select pattern');
assert(/id="homePitcherSelect" class="sim-select starter-select pitcher-select"/.test(html), 'Team B starter select uses the same styled select pattern');
assert(/Starting Pitcher/.test(html), 'starting pitcher controls are labeled');
assert(!/Select team first/.test(html), 'empty pitcher dropdown copy is removed');
assert(/Run Simulation/.test(html), 'Run Simulation button is present');
assert(/Current Teams/.test(html), 'current-team preset is present');
assert(/Classic Teams/.test(html), 'classic-team preset is present');
assert(/Mixed Era Matchup/.test(html), 'mixed-era preset is present');
assert(/class="sim-workflow"/.test(html), 'flagship workflow strip is present');
assert(/Step 1/.test(html) && /Step 5/.test(html), 'step-based simulator workflow is visible');
assert(/Projection and input notes/.test(html), 'projection review workflow step is present');
assert(/Data Notes/.test(html), 'compact data notes area is present');
assert(/Verified live inputs appear when available/.test(html), 'compact live-input limitation text is present');
assert(!/No matching current MLB game found|No verified record match available|No verified injury report match available|No verified player roster list is connected|No verified bullpen depth|No verified sportsbook odds match available/.test(html), 'unavailable source wall is not rendered in initial HTML');
assert(/Run simulation/.test(html), 'projected score empty state is polished');
assert(/awayPickerIdentity/.test(html) && /homePickerIdentity/.test(html), 'team identity areas are present');
assert(/awayHeaderLogo/.test(html) && /homeHeaderLogo/.test(html), 'matchup review logo areas are present');
assert(/Inside the TrustMyRecord MLB Simulator/.test(html), 'explainer section is present');
assert(/model-based estimate/.test(html), 'explainer avoids overclaiming accuracy');
assert(/id="boxScorePanel"/.test(html), 'box score panel is present');
assert(/id="projectionEmptyState"/.test(html), 'pre-run projection empty state is present');
assert(/Copy Box Score/.test(html), 'copy box score action is present');
assert(/Save Box Score/.test(html), 'save box score action is present');
assert(/Player Box Score/.test(html), 'player box score is labeled as player output backed by roster names');
assert(!/ARI CF \(modeled\)|ATL CF \(modeled\)|Reliever A \(modeled\)|Reliever B \(modeled\)/.test(script + html), 'player box score does not use fake modeled player labels');
assert(/Select two teams, choose starting pitchers, then run the simulator/.test(html), 'pre-run state uses a single polished instruction panel');
assert(/Choose starters/.test(html), 'starter-dependent empty state is polished');
assert(!/Loading MLB games|Loading sportsbook board|Waiting for board data|Projection engine not connected yet|Not connected for custom simulation|Unavailable without real inputs/.test(html), 'old board-dependent placeholder text is removed');
assert(!/lock pick|locked pick|submit pick/i.test(html), 'page does not expose sportsbook submission actions');
assert(!/live verified|official injury/i.test(html), 'page does not include fake live data claims');

const css = fs.readFileSync(path.join(root, 'static', 'css', 'mlb-simulator.css'), 'utf8');
assert(/\.box-score-panel\s*{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*min-width:\s*0;/s.test(css), 'box score panel spans the simulator grid instead of auto-placing into a narrow column');
assert(/\.box-score-scroll\s*{[^}]*max-width:\s*100%;[^}]*min-width:\s*0;[^}]*overflow-x:\s*auto;/s.test(css), 'box score table scrolling is contained inside the table container');

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
  'boxScoreSummary','copyBoxScoreButton','saveBoxScoreButton','playerBoxScorePanel','playerBoxScoreContent',
  'projectionEmptyState','probabilityLab','viewBoxScoreLink','viewBoxScoreControl','simulationCountSelect',
  'aggregatePanel','aggregateSummaryGrid','aggregateSummaryText'
];

let savedDownload = null;
let clipboardText = '';

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

function mockResponse(data) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function buildFetchMock(mode) {
  return (url) => {
    if (mode === 'unavailable') return Promise.reject(new Error('network unavailable'));
    if (String(url).includes('statsapi.mlb.com/api/v1/teams/')) {
      const teamId = (String(url).match(/teams\/(\d+)\/roster/) || [])[1];
      const rosters = {
        109: ['Zac Gallen|P', 'Kevin Ginkel|P', 'Ryan Thompson|P', 'Brandon Pfaadt|P', 'Eduardo Rodriguez|P', 'Gabriel Moreno|C', 'Ketel Marte|2B', 'Geraldo Perdomo|SS', 'Eugenio Suarez|3B', 'Josh Naylor|1B', 'Corbin Carroll|CF', 'Lourdes Gurriel Jr.|LF', 'Jake McCarthy|RF', 'Randal Grichuk|DH'],
        144: ['Bryce Elder|P', 'Aaron Bummer|P', 'Raisel Iglesias|P', 'Chris Sale|P', 'Spencer Strider|P', 'Sean Murphy|C', 'Matt Olson|1B', 'Ozzie Albies|2B', 'Austin Riley|3B', 'Orlando Arcia|SS', 'Michael Harris II|CF', 'Ronald Acuna Jr.|RF', 'Jurickson Profar|LF', 'Marcell Ozuna|DH'],
        140: ['Jacob deGrom|P', 'MacKenzie Gore|P', 'Chris Martin|P', 'Robert Garcia|P', 'Nathan Eovaldi|P', 'Jonah Heim|C', 'Corey Seager|SS', 'Marcus Semien|2B', 'Josh Jung|1B', 'Wyatt Langford|RF', 'Evan Carter|CF', 'Adolis Garcia|LF', 'Josh Smith|3B'],
        147: ['Gerrit Cole|P', 'Devin Williams|P', 'Luke Weaver|P', 'Max Fried|P', 'Carlos Rodon|P', 'Austin Wells|C', 'Anthony Volpe|SS', 'Jazz Chisholm Jr.|2B', 'Paul Goldschmidt|1B', 'Aaron Judge|RF', 'Cody Bellinger|CF', 'Jasson Dominguez|LF', 'Ben Rice|1B'],
        137: ['Logan Webb|P', 'Robbie Ray|P', 'Landen Roupp|P', 'Tyler Mahle|P', 'Adrian Houser|P', 'Jung Hoo Lee|CF', 'Heliot Ramos|LF', 'Casey Schmitt|1B', 'Matt Chapman|3B', 'Patrick Bailey|C', 'Willy Adames|SS', 'Mike Yastrzemski|RF', 'Wilmer Flores|DH'],
      };
      return mockResponse({
        roster: (rosters[teamId] || []).map((entry, index) => {
          const [name, position] = entry.split('|');
          return { person: { id: index + 1, fullName: name }, position: { abbreviation: position }, parentTeamId: Number(teamId), status: { code: 'A' } };
        }),
      });
    }
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
      if (String(url).includes('/teams/ari/roster')) {
        return mockResponse({
          athletes: [
            { position: 'Pitchers', items: [
              { displayName: 'Zac Gallen', position: { abbreviation: 'SP' } },
              { displayName: 'Kevin Ginkel', position: { abbreviation: 'RP' } },
              { displayName: 'Ryan Thompson', position: { abbreviation: 'RP' } },
            ] },
            { position: 'Catchers', items: [{ displayName: 'Gabriel Moreno', position: { abbreviation: 'C' } }] },
            { position: 'Infielders', items: [
              { displayName: 'Ketel Marte', position: { abbreviation: '2B' } },
              { displayName: 'Geraldo Perdomo', position: { abbreviation: 'SS' } },
              { displayName: 'Eugenio Suarez', position: { abbreviation: '3B' } },
              { displayName: 'Josh Naylor', position: { abbreviation: '1B' } },
            ] },
            { position: 'Outfielders', items: [
              { displayName: 'Corbin Carroll', position: { abbreviation: 'CF' } },
              { displayName: 'Lourdes Gurriel Jr.', position: { abbreviation: 'LF' } },
              { displayName: 'Jake McCarthy', position: { abbreviation: 'RF' } },
              { displayName: 'Randal Grichuk', position: { abbreviation: 'DH' } },
            ] },
          ],
        });
      }
      if (String(url).includes('/teams/atl/roster')) {
        return mockResponse({
          athletes: [
            { position: 'Pitchers', items: [
              { displayName: 'Bryce Elder', position: { abbreviation: 'SP' } },
              { displayName: 'Aaron Bummer', position: { abbreviation: 'RP' } },
              { displayName: 'Raisel Iglesias', position: { abbreviation: 'RP' } },
            ] },
            { position: 'Catchers', items: [{ displayName: 'Sean Murphy', position: { abbreviation: 'C' } }] },
            { position: 'Infielders', items: [
              { displayName: 'Matt Olson', position: { abbreviation: '1B' } },
              { displayName: 'Ozzie Albies', position: { abbreviation: '2B' } },
              { displayName: 'Austin Riley', position: { abbreviation: '3B' } },
              { displayName: 'Orlando Arcia', position: { abbreviation: 'SS' } },
            ] },
            { position: 'Outfielders', items: [
              { displayName: 'Michael Harris II', position: { abbreviation: 'CF' } },
              { displayName: 'Ronald Acuna Jr.', position: { abbreviation: 'RF' } },
              { displayName: 'Jurickson Profar', position: { abbreviation: 'LF' } },
              { displayName: 'Marcell Ozuna', position: { abbreviation: 'DH' } },
            ] },
          ],
        });
      }
      if (String(url).includes('/teams/tex/roster') || String(url).includes('/teams/nyy/roster')) {
        return mockResponse({
          athletes: [
            { position: 'Pitchers', items: [
              { displayName: String(url).includes('/teams/tex/') ? 'Jacob deGrom' : 'Gerrit Cole', position: { abbreviation: 'SP' } },
              { displayName: String(url).includes('/teams/tex/') ? 'Chris Martin' : 'Devin Williams', position: { abbreviation: 'RP' } },
              { displayName: String(url).includes('/teams/tex/') ? 'Robert Garcia' : 'Luke Weaver', position: { abbreviation: 'RP' } },
            ] },
            { position: 'Catchers', items: [{ displayName: String(url).includes('/teams/tex/') ? 'Jonah Heim' : 'Austin Wells', position: { abbreviation: 'C' } }] },
            { position: 'Infielders', items: [
              { displayName: String(url).includes('/teams/tex/') ? 'Corey Seager' : 'Anthony Volpe', position: { abbreviation: 'SS' } },
              { displayName: String(url).includes('/teams/tex/') ? 'Marcus Semien' : 'Jazz Chisholm Jr.', position: { abbreviation: '2B' } },
              { displayName: String(url).includes('/teams/tex/') ? 'Josh Jung' : 'Paul Goldschmidt', position: { abbreviation: '1B' } },
            ] },
            { position: 'Outfielders', items: [
              { displayName: String(url).includes('/teams/tex/') ? 'Wyatt Langford' : 'Aaron Judge', position: { abbreviation: 'RF' } },
              { displayName: String(url).includes('/teams/tex/') ? 'Evan Carter' : 'Cody Bellinger', position: { abbreviation: 'CF' } },
              { displayName: String(url).includes('/teams/tex/') ? 'Adolis Garcia' : 'Jasson Dominguez', position: { abbreviation: 'LF' } },
            ] },
          ],
        });
      }
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
    window: {
      URL: {
        createObjectURL(blob) { return 'blob:mlb-box-score'; },
        revokeObjectURL() {},
      },
    },
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      addEventListener() {},
      createElement(tag) {
        assert.strictEqual(tag, 'a', 'save action creates an anchor');
        return {
          href: '',
          download: '',
          click() { savedDownload = this.download; },
        };
      },
      body: {
        appendChild() {},
        removeChild() {},
      },
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
    navigator: {
      clipboard: {
        writeText(value) {
          clipboardText = value;
          return Promise.resolve();
        },
      },
    },
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
  const awayId = pitcherOptionId(elements.awayPitcherSelect.innerHTML, awayLabel);
  const homeId = pitcherOptionId(elements.homePitcherSelect.innerHTML, homeLabel);
  elements.awayPitcherSelect.value = awayId;
  elements.homePitcherSelect.value = homeId;
  elements.awayPitcherSelect.listeners.change();
  elements.homePitcherSelect.listeners.change();
}

function pitcherOptionId(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const options = html.match(/<option[\s\S]*?<\/option>/g) || [];
  const option = options.filter((item) => new RegExp('>' + escaped + ', ERA ').test(item))[0];
  assert(option, 'pitcher option exists: ' + label);
  const match = option.match(/value="([^"]+)"/);
  assert(match, 'pitcher option id exists: ' + label);
  return match[1];
}

function pitcherSelectTarget(side, id) {
  return {
    value: id,
    closest(selector) {
      if (selector !== '[data-pitcher-side="' + side + '"]') return null;
      return { value: id };
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
  simulator.localTeams.current.forEach((team) => {
    const pitchers = simulator.pitcherOptionsFor(team, 'away', null);
    assert.strictEqual(pitchers.length, 0, team.name + ' does not expose current pitcher names until a verified roster loads');
  });
  simulator.localTeams.historical.forEach((team) => {
    const pitchers = simulator.pitcherOptionsFor(team, 'away', null);
    assert.strictEqual(pitchers.length, 5, team.name + ' has five historical named starter options');
    assert(pitchers.every((pitcher) => /^[A-Z][A-Za-z'. -]+$/.test(pitcher.name)), team.name + ' historical starter options are actual names');
    assert(!/baseline ace|baseline starter|depth starter|era-average starter|staff game|Ace profile|Above average starter|League average starter|Back end starter|Bullpen game/.test(pitchers.map((pitcher) => pitcher.name).join('|')), team.name + ' has no fallback starter labels');
  });
  assert(!/Zac Gallen|Chris Sale/.test(elements.awayPitcherSelect.innerHTML + elements.homePitcherSelect.innerHTML), 'current dropdowns do not show static current names before verified rosters load');
  assert(/No pitcher selected/.test(elements.homePitcherMeta.textContent), 'current starter area does not invent a pitcher when roster fetch is unavailable');
  assert(!/Ace profile|Above average starter|League average starter|Back end starter|Bullpen game/.test(elements.awayPitcherSelect.innerHTML + elements.homePitcherSelect.innerHTML), 'current mode does not render generic starter profiles');
  assert(!/Team rotation option/.test(elements.awayPitcherSelect.innerHTML + elements.homePitcherSelect.innerHTML), 'current selector does not use vague team-rotation wording');
  assert(!/Rating|Starter list selection|Historical simulator input/.test(elements.awayPitcherSelect.innerHTML + elements.homePitcherSelect.innerHTML), 'dropdown avoids extra rating/source clutter');
  assert.strictEqual(elements.dataModeBadge.textContent, 'Baseline ratings', 'baseline data mode is explicit by default');
  assert(/Verified live inputs are unavailable/.test(elements.dataModeDetail.textContent), 'live input unavailability is explicit');
  assert(/baseline team and starter profiles/.test(elements.liveInputGrid.innerHTML), 'data notes give one compact fallback message');
  assert(!/No matching current MLB game found|No verified record match available|No verified injury report match available|No verified player roster list is connected|No verified bullpen depth|No verified sportsbook odds match available/.test(elements.liveInputGrid.innerHTML), 'fallback data notes do not render unavailable source wall');
  assert.strictEqual(elements.projectionShell.getAttribute('data-projection-state'), 'not-connected', 'pre-run metric card grid is hidden by state');
  assert.strictEqual(elements.projectionEmptyState.getAttribute('data-empty-state'), 'ready', 'pre-run empty state is visible by state');
  assert.strictEqual(elements.probabilityLab.getAttribute('data-probability-state'), 'empty', 'pre-run probability bars are hidden by state');
  assert.strictEqual(elements.copyBoxScoreButton.disabled, true, 'copy box score button is disabled before simulation');
  assert.strictEqual(elements.saveBoxScoreButton.disabled, true, 'save box score button is disabled before simulation');

  await simulator.runSimulation();
  assert.strictEqual(elements.resultCard.getAttribute('data-result-state'), 'projected', 'fallback run renders projected state');
  assert.strictEqual(elements.projectionEmptyState.getAttribute('data-empty-state'), 'hidden', 'pre-run empty state hides after simulation');
  assert.strictEqual(elements.probabilityLab.getAttribute('data-probability-state'), 'projected', 'probability lab appears after simulation');
  assert(/%/.test(elements.winProbabilityValue.textContent), 'estimated win percentage renders after simulation');
  assert.strictEqual(elements.boxScorePanel.getAttribute('data-box-score-state'), 'projected', 'box score panel renders after simulation');
  assert(/<tr/.test(elements.boxScoreBody.innerHTML), 'box score table rows render after simulation');
  assert(/Final/.test(elements.boxScoreTitle.textContent), 'box score title includes final score');
  assert.strictEqual(elements.copyBoxScoreButton.disabled, false, 'copy box score button enables after simulation');
  assert.strictEqual(elements.saveBoxScoreButton.disabled, false, 'save box score button enables after simulation');
  assert(/Roster temporarily unavailable/.test(elements.playerBoxScoreContent.innerHTML), 'network-unavailable path labels roster limitation clearly');
  const fallbackBox = simulator.state.simulation.boxScore;
  assert.strictEqual(fallbackBox.away.innings.reduce((total, value) => total + value, 0), fallbackBox.away.runs, 'away inning totals equal away final score');
  assert.strictEqual(fallbackBox.home.innings.reduce((total, value) => total + value, 0), fallbackBox.home.runs, 'home inning totals equal home final score');
  assert(fallbackBox.away.runs <= 20 && fallbackBox.home.runs <= 20, 'box score caps individual scores at baseball range');
  assert(fallbackBox.away.runs + fallbackBox.home.runs <= 30, 'box score caps combined scores at baseball range');
  const fallbackText = simulator.boxScoreText(simulator.state.simulation);
  assert(/TrustMyRecord MLB Simulator Box Score/.test(fallbackText), 'readable box score export text is generated');
  assert(/Starting Pitchers:/.test(fallbackText), 'box score export includes starting pitchers');
  assert(/Team\s+1 2 3 4 5 6 7 8 9 \| R H E/.test(fallbackText), 'box score export includes inning header');
  simulator.copyBoxScore();
  await flushAsync();
  assert(/TrustMyRecord MLB Simulator Box Score/.test(clipboardText), 'copy box score writes readable export text');
  simulator.saveBoxScore();
  assert(/^trustmyrecord-mlb-simulator-box-score-.*-\d{4}-\d{2}-\d{2}\.txt$/.test(savedDownload), 'save box score uses clean dated filename');
  assert(/Starting pitchers/.test(elements.inputSummary.innerHTML), 'output includes selected starters row');
  assert.strictEqual(elements.dataModeValue.textContent, 'Baseline ratings', 'fallback output states baseline data mode');
  assert(!/official pick|sportsbook edge/i.test(elements.projectionNotice.textContent), 'fallback disclaimer does not overclaim');
  assert(!/Missing data/.test(elements.inputSummary.innerHTML), 'missing data is not rendered as a noisy row');
  assert(!/DraftKings|FanDuel|BetMGM|live verified|official injury/i.test([
    elements.simBoardMessage.textContent,
    elements.projectionNotice.textContent,
    elements.inputSummary.innerHTML,
    elements.matchupNotes.innerHTML,
  ].join(' ')), 'fallback rendered simulator avoids fake live data claims');

  const rostered = createSimulator('available');
  await flushAsync();
  await rostered.simulator.runSimulation();
  assert(/Corbin Carroll|Ketel Marte|Geraldo Perdomo/.test(rostered.elements.playerBoxScoreContent.innerHTML), 'current matchup renders verified Arizona hitter names');
  assert(/Michael Harris II|Ronald Acuna Jr\.|Matt Olson|Ozzie Albies/.test(rostered.elements.playerBoxScoreContent.innerHTML), 'current matchup renders verified Atlanta hitter names');
  assert(/Zac Gallen|Kevin Ginkel|Ryan Thompson/.test(rostered.elements.playerBoxScoreContent.innerHTML), 'current matchup renders Arizona pitcher names');
  assert(/Bryce Elder|Aaron Bummer|Raisel Iglesias/.test(rostered.elements.playerBoxScoreContent.innerHTML), 'current matchup renders Atlanta pitcher names');
  assert(/Verified MLB active roster endpoint/.test(rostered.elements.playerBoxScoreContent.innerHTML), 'current matchup labels MLB roster source');
  assert(!/Nolan Arenado/.test(rostered.elements.playerBoxScoreContent.innerHTML), 'Arizona box score blocks reported wrong-team Nolan Arenado row');
  assert(!/Lineup Slot|Pitching Slot|Simulation Slot Lines|simulation slot -/.test(rostered.elements.playerBoxScoreContent.innerHTML), 'current roster-backed box score does not show generic slot labels');

  elements.historicalModeButton.listeners.click();
  assert(/1927 New York Yankees/.test(elements.awayTeamSelect.innerHTML), 'historical teams render after tab switch');
  assert(/2023 Texas Rangers/.test(elements.homeTeamSelect.innerHTML), 'full historical list is present');
  assert(/Waite Hoyt/.test(elements.awayPitcherSelect.innerHTML), 'historical pitcher options render');
  assert.strictEqual((elements.awayPitcherSelect.innerHTML.match(/<option value=/g) || []).length, 5, 'historical Team A dropdown shows five pitcher options');
  assert.strictEqual((elements.homePitcherSelect.innerHTML.match(/<option value=/g) || []).length, 5, 'historical Team B dropdown shows five pitcher options');
  assert(/Waite Hoyt, ERA 2.63, W-L (22-7|N\/A|Record unavailable)/.test(elements.awayPitcherSelect.innerHTML), 'historical dropdown option includes name, ERA, and W-L context');
  await simulator.runSimulation();
  assert(/Classic baseline/.test(elements.simulationModeValue.textContent), 'classic matchup reports classic simulation mode');
  assert(/Waite Hoyt|Red Ruffing/.test(elements.matchupNotes.innerHTML), 'classic output includes historical starter names');

  elements.mixedModeButton.listeners.click();
  assert.strictEqual(elements.awayPoolSelect.value, 'current', 'mixed mode keeps Team A current');
  assert.strictEqual(elements.homePoolSelect.value, 'historical', 'mixed mode sets Team B historical');
  assert(!/Zac Gallen/.test(elements.awayPitcherSelect.innerHTML), 'mixed mode current pitcher options wait for verified roster');
  assert(/Red Ruffing/.test(elements.homePitcherSelect.innerHTML), 'mixed mode historical pitcher options render');
  assert(!/Zac Gallen/.test(elements.awayPitcherSelect.innerHTML), 'mixed Team A dropdown waits for verified current roster options');
  assert.strictEqual((elements.homePitcherSelect.innerHTML.match(/<option value=/g) || []).length, 5, 'mixed Team B dropdown shows five pitcher options');
  await simulator.runSimulation();
  assert.strictEqual(elements.projectionShell.getAttribute('data-projection-state'), 'projected', 'mixed matchup can run simulation');
  assert(/Mixed-era baseline/.test(elements.simulationModeValue.textContent), 'mixed matchup reports mixed-era simulation mode');
  assert(/Starting Pitchers/.test(elements.matchupNotes.innerHTML), 'mixed output includes selected starter section');

  const live = createSimulator('available');
  await live.simulator.loadLiveContext();
  choose(live.elements, 'Texas Rangers', 'New York Yankees');
  await live.simulator.runSimulation();
  assert.strictEqual((live.elements.awayPitcherSelect.innerHTML.match(/<option value=/g) || []).length, 5, 'live Team A dropdown shows five pitcher options');
  assert.strictEqual((live.elements.homePitcherSelect.innerHTML.match(/<option value=/g) || []).length, 5, 'live Team B dropdown shows five pitcher options');
  assert(/Jacob deGrom, ERA 3.2, W-L 2-1/.test(live.elements.awayPitcherSelect.innerHTML), 'live probable away starter appears as a selectable dropdown option');
  assert(/Gerrit Cole, ERA 2.88, W-L 3-1/.test(live.elements.homePitcherSelect.innerHTML), 'live probable home starter appears as a selectable dropdown option');
  assert.strictEqual(live.elements.dataModeBadge.textContent, 'Verified live inputs', 'live path switches data mode');
  assert.strictEqual(live.elements.dataModeValue.textContent, 'Verified live inputs', 'live output states verified data mode');
  assert(/MLB schedule\/finals/.test(live.elements.inputSummary.innerHTML), 'live path includes schedule/finals source');
  assert(/Team records/.test(live.elements.inputSummary.innerHTML), 'live path includes team records source');
  assert(/Probable starters/.test(live.elements.inputSummary.innerHTML), 'live path includes probable starter source');
  assert(!/Missing data/.test(live.elements.inputSummary.innerHTML), 'live path avoids noisy missing-data row');
  assert(/Ballpark/.test(live.elements.inputSummary.innerHTML), 'live path includes ballpark source');
  assert(/Weather/.test(live.elements.inputSummary.innerHTML), 'live path includes weather source');
  assert(/Sportsbook odds/.test(live.elements.inputSummary.innerHTML), 'live path includes sportsbook source when verified');
  assert(/Injury report/.test(live.elements.inputSummary.innerHTML), 'live path includes injury report source');
  assert(/Recent scoring form/.test(live.elements.inputSummary.innerHTML), 'live path includes recent scoring form source');
  assert(!/No verified player roster list is connected|No verified bullpen depth|No verified sportsbook odds match available/.test(live.elements.inputSummary.innerHTML + live.elements.liveInputGrid.innerHTML), 'live path does not show noisy unavailable-source messages');
  assert(/Recent scoring form from ESPN finals/.test(live.elements.matchupNotes.innerHTML), 'live path factors recent final scores');
  assert(/Gerrit Cole|Jacob deGrom|Yankee Stadium|Weather context from ESPN|ESPN injury report|Bullpen context is limited/.test(live.elements.matchupNotes.innerHTML), 'live path renders verified context as factors');
  assert(/Starting Pitchers:/.test(live.elements.matchupNotes.innerHTML) && /Jacob deGrom/.test(live.elements.matchupNotes.innerHTML) && /Gerrit Cole/.test(live.elements.matchupNotes.innerHTML), 'live output shows selected verified probable starters');
  const liveExpectedRuns = live.elements.expectedRunsValue.textContent;
  choosePitchers(live.elements, 'MacKenzie Gore', 'Gerrit Cole');
  await live.simulator.runSimulation();
  assert.notStrictEqual(live.elements.expectedRunsValue.textContent, liveExpectedRuns, 'changing selected live/manual starter changes projection');
  assert(/MacKenzie Gore/.test(live.elements.matchupNotes.innerHTML), 'manual selected current pitcher is shown in output');
  assert(!/verified betting edge|official injury/i.test(live.elements.matchupNotes.innerHTML), 'live path does not claim fake edges or injuries');

  console.log('mlb-simulator-page-test: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

