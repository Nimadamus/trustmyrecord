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
  'boxScorePanel','boxScoreTitle','boxScoreMatchupCard','boxScoreBody','playerBoxScorePanel',
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

// The simulator is evaluated inside a `vm` sandbox, which does NOT inherit
// Node's timer globals. static/js/mlb-simulator.js needs them in two real code
// paths: runSimulation() races the live-context load against a 2500ms
// setTimeout, and the play-by-play playback uses setInterval. Without them this
// harness died with "setTimeout is not defined" at the first runSimulation(),
// before a single box-score assertion could run.
//
// Real timers are provided rather than no-op stubs, so the 2500ms race actually
// settles and the code under test behaves exactly as it does in a browser.
// Every handle is unref'd, so a timer still pending when the assertions finish
// can never hold the test process open.
function sandboxTimers() {
  function wrap(create) {
    return function () {
      var handle = create.apply(null, arguments);
      if (handle && typeof handle.unref === 'function') handle.unref();
      return handle;
    };
  }
  return {
    setTimeout: wrap(setTimeout),
    setInterval: wrap(setInterval),
    clearTimeout: clearTimeout,
    clearInterval: clearInterval,
  };
}

// Minimal MLB Stats API mock built from this file's own roster fixtures.
// Anything the simulator asks for that is not the active-roster endpoint
// resolves to an empty-but-valid payload: fetchTeamRoster() runs its four
// lookups through Promise.all, so a rejection anywhere would abort the whole
// roster load and put us straight back on the nameless-lineup path.
function buildRosterFetchMock() {
  return (url) => {
    const target = String(url);
    const rosterMatch = target.match(/statsapi\.mlb\.com\/api\/v1\/teams\/(\d+)\/roster/);
    if (rosterMatch) {
      const teamId = Number(rosterMatch[1]);
      const abbr = Object.keys(teamIds).find((key) => teamIds[key] === teamId);
      const names = (abbr && rosterNames[abbr]) || [];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          roster: names.map((entry, index) => {
            const [fullName, position] = entry.split('|');
            return {
              person: { id: teamId * 100 + index + 1, fullName },
              position: { abbreviation: position },
              parentTeamId: teamId,
              status: { code: 'A' },
            };
          }),
        }),
      });
    }
    // Schedule, boxscore, transactions, injuries, player stats: valid but empty.
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ dates: [], roster: [], people: [], teams: {} }) });
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
    // An always-rejecting fetch made most of this file unreachable:
    // fetchTeamRoster() sets state.liveContext.teamRosters[abbr] = null in its
    // catch, which wiped the preloaded fixture and left a NAMELESS lineup - so
    // the engine's `.filter(row => row.name)` dropped every batter, the box score
    // rendered "Lineup unavailable", and every assertion below about batting and
    // pitching tables could never pass. (It also made the engine's own
    // reconciliation self-check log BOX SCORE RECONCILIATION FAILED on every
    // run, because the event log still counted plate appearances for batters the
    // engine had dropped.) Serve the MLB active-roster endpoint from the same
    // fixtures this file already declares, so the roster-backed path is what
    // actually gets exercised.
    fetch: buildRosterFetchMock(),
    ...sandboxTimers(),
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
    source: 'Projected batting order from verified MLB active roster endpoint',
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
  // Away always completes its innings (9, or more in extras). Home matches the away
  // column count, except when it wins in regulation and the bottom of the final inning
  // is not played (skipped-final), in which case it is exactly one column short.
  assert(box.away.innings.length >= 9, 'away has at least nine innings');
  assert(
    box.home.innings.length === box.away.innings.length ||
    box.home.innings.length === box.away.innings.length - 1,
    'home column count matches away (or one short on a skipped bottom-final)'
  );
  assert(box.away.runs <= 20 && box.home.runs <= 20, 'individual runs remain capped');
  assert(box.away.runs + box.home.runs <= 30, 'combined runs remain capped');
  // NOT a baseball rule: runs can legitimately exceed hits (walks, HBP, errors,
  // sacrifice flies, wild pitches, steals). The old `hits >= runs` assertion
  // failed on correct simulator output roughly one run in ten. The real
  // invariant is that a team cannot score without having put someone on base.
  [[box.away, box.home], [box.home, box.away]].forEach(([line, opponent]) => {
    if (!line.runs) return;
    const summary = line.summaryStats || {};
    const baserunners = (line.hits || 0) + (summary.walks || 0) + (summary.hbp || 0) + (opponent.errors || 0);
    assert(baserunners > 0,
      'a team that scored ' + line.runs + ' run(s) reached base at least once');
  });
  assert(box.away.hits <= 25 && box.home.hits <= 25, 'hits remain plausible');
  assert(box.away.errors <= 4 && box.home.errors <= 4, 'errors remain plausible');
  [box.away, box.home].forEach((line) => {
    assert(line.summaryStats, 'team summary stats exist');
    ['doubles', 'triples', 'homeRuns', 'rbi', 'walks', 'strikeouts', 'stolenBases', 'caughtStealing', 'leftOnBase', 'totalPitches', 'totalStrikes', 'hits', 'runs', 'errors', 'sacFlies', 'sacBunts', 'hbp'].forEach((key) => {
      assert(Number.isFinite(line.summaryStats[key]), `${key} is numeric`);
    });
    assert(line.summaryStats.totalPitches >= line.summaryStats.totalStrikes, 'pitches are greater than or equal to strikes');
    assert(line.summaryStats.hits === line.hits, 'summary hits mirror line score');
    assert(line.summaryStats.runs === line.runs, 'summary runs mirror line score');
    assert(line.summaryStats.errors === line.errors, 'summary errors mirror line score');
  });
  assert(box.winner.id === (box.away.runs > box.home.runs ? result.away.id : result.home.id), 'winner matches line score');
  assert(result.winner.id === (result.homeWin >= result.awayWin ? result.home.id : result.away.id), 'projected winner matches higher win probability');
  // SCORING_EVENT_LOG_20260703: the per-game event log must reconcile to the team
  // totals — every home run in a team's summary is an event in the log, and vice versa.
  assert(Array.isArray(box.scoringLog), 'scoring log is present');
  const hrByTeam = {};
  box.scoringLog.forEach((event) => {
    assert(event.inning >= 1, 'scoring event has a valid inning');
    assert(event.half === 'top' || event.half === 'bottom', 'scoring event has a valid half');
    if (event.type === 'HR') hrByTeam[event.team] = (hrByTeam[event.team] || 0) + 1;
  });
  [[result.away, box.away], [result.home, box.home]].forEach(([team, line]) => {
    assert.strictEqual(hrByTeam[team.abbreviation] || 0, line.summaryStats.homeRuns, 'HR event log count reconciles to team HR total for ' + team.abbreviation);
  });
}

// ---------------------------------------------------------------------------
// Pitcher decisions.
//
// A pitcher's decision renders inside the name cell as
//   <span class="bx-dec bx-dec-W">W</span>
// and a blown save is INDEPENDENT of the W/L/SV/HLD decision, so the same cell
// legitimately reads "L, BS" or "W, BS" (BLOWN_SAVE_20260727 - a pitcher can
// blow the save and still take the win if his team retakes the lead).
//
// Parsing that cell with /([A-Z]+)/ silently discards every combined label,
// which is what made this suite look like the engine was dropping decisions.
// Split the cell on commas instead, then assert the real baseball rules.
// ---------------------------------------------------------------------------
const DECISION_LABELS = ['W', 'L', 'SV', 'HLD', 'BS'];

function parsePitchingTables(html) {
  return [...html.matchAll(/<p class="team-box-label">([^<]*?) Pitching<\/p>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g)]
    .map(([, team, body]) => ({
      team: team.trim(),
      rows: [...body.matchAll(/<tr><th scope="row">([\s\S]*?)<\/th>/g)]
        .map((match) => match[1])
        .filter((cell) => cell.trim() !== 'Totals')
        .map((cell) => {
          const decisionCell = cell.match(/<span class="bx-dec[^"]*">([^<]+)<\/span>/);
          return {
            name: cell.replace(/<span[\s\S]*$/, '').trim(),
            decisions: decisionCell ? decisionCell[1].split(',').map((part) => part.trim()) : [],
          };
        }),
    }));
}

function assertPitcherDecisions(html, box, label) {
  const tables = parsePitchingTables(html);
  assert.strictEqual(tables.length, 2, label + ' renders a pitching table for both clubs');
  const all = tables.flatMap((table) => table.rows.flatMap((row) => row.decisions));
  const show = ' | decisions: ' + JSON.stringify(tables.map((t) => t.rows.map((r) => ({ [r.name]: r.decisions }))));

  all.forEach((decision) => {
    assert(DECISION_LABELS.includes(decision),
      label + ' pitching table uses only real decision labels, got ' + JSON.stringify(decision) + show);
  });

  // MLB awards no decision until a suspended game is resumed and completed.
  if (box.gameStatus === 'suspended') {
    assert.strictEqual(all.length, 0, label + ' suspended game awards no decisions' + show);
    return;
  }

  const count = (decision) => all.filter((entry) => entry === decision).length;
  assert.strictEqual(count('W'), 1, label + ' credits exactly one winning pitcher' + show);
  assert.strictEqual(count('L'), 1, label + ' charges exactly one losing pitcher' + show);
  assert(count('SV') <= 1, label + ' credits zero or one save' + show);

  const winnerTable = tables.find((table) => table.rows.some((row) => row.decisions.includes('W')));
  const loserTable = tables.find((table) => table.rows.some((row) => row.decisions.includes('L')));
  assert(winnerTable && loserTable, label + ' places both decisions in a rendered table' + show);
  assert.notStrictEqual(winnerTable.team, loserTable.team,
    label + ' puts the win and the loss on opposite clubs' + show);

  // The save always belongs to the winning club, never the losing one.
  const saveTable = tables.find((table) => table.rows.some((row) => row.decisions.includes('SV')));
  if (saveTable) {
    assert.strictEqual(saveTable.team, winnerTable.team, label + ' credits the save to the winning club' + show);
  }

  tables.forEach((table) => table.rows.forEach((row) => {
    assert.strictEqual(new Set(row.decisions).size, row.decisions.length,
      label + ' does not repeat a decision on one pitcher' + show);
    if (row.decisions.length) {
      // Requirement: never label a pitcher who did not appear in the game.
      assert(row.name, label + ' never labels an unnamed pitcher row' + show);
    }
    // A pitcher cannot both win the game and save it.
    assert(!(row.decisions.includes('W') && row.decisions.includes('SV')),
      label + ' never gives one pitcher both the win and the save' + show);
  }));
}

function assertCleanProjectedLineups(html, label) {
  // Batter rows render as
  //   <th scope="row"><span class="bx-slot">N</span> Name <span class="bx-pos">POS</span></th>
  // The old pattern expected a flat "Name (POS)" cell, so once this function was
  // reachable at all it matched nothing and asserted against an empty list.
  const rows = [...html.matchAll(/<span class="bx-slot">(\d+)<\/span>\s*([^<]+?)\s*<span class="bx-pos">([A-Z0-9]+)<\/span>/g)]
    .map((match) => ({ slot: Number(match[1]), name: match[2].trim(), position: match[3] }));
  assert(rows.length >= 18, label + ' renders two nine-player batting orders (got ' + rows.length + ' batter rows)');

  [rows.slice(0, 9), rows.slice(9, 18)].forEach((lineup, index) => {
    const who = label + ' team ' + (index + 1);
    assert.strictEqual(lineup.length, 9, who + ' has nine hitters');
    assert.deepStrictEqual(lineup.map((row) => row.slot), [1, 2, 3, 4, 5, 6, 7, 8, 9],
      who + ' batting order is numbered 1-9 in order');
    lineup.forEach((row) => {
      assert(row.name, who + ' every batting slot names a player');
      assert(!/\(|\)|slot|Slot|modeled/.test(row.name),
        who + ' batting slot uses a real name, not a placeholder: ' + row.name);
      assert(!/^(P|SP|RP|CP)$/.test(row.position), who + ' does not bat a pitcher: ' + row.name);
    });
    assert.strictEqual(new Set(lineup.map((row) => row.name)).size, 9,
      who + ' does not repeat a player in the order');
  });
}

// ---------------------------------------------------------------------------
// Deterministic pitcher-decision rules.
//
// The rendered-box-score checks above prove the invariants hold on whatever the
// dice produce; these drive pitcherDecisions() directly (already exposed on the
// test-only _engine hook) so every special case is covered on EVERY run instead
// of only when the simulation happens to produce one: extra innings, walk-offs,
// pitcher-of-record changes, blown saves, holds, and no-save situations.
// ---------------------------------------------------------------------------
function pitcherRow(name, outs, runs, enterMargin) {
  const row = { name, outs, r: runs, h: 0, er: runs, bb: 0, so: 0, hr: 0 };
  if (enterMargin !== undefined) row.enterMargin = enterMargin;
  return row;
}

function labelsOf(result) {
  return result.labels.map((label, index) => [label || '', result.blownSaves[index] ? 'BS' : '']
    .filter(Boolean).join(','));
}

function assertDecisionRules(simulator) {
  const decide = simulator._engine.pitcherDecisions;
  assert.strictEqual(typeof decide, 'function', 'pitcherDecisions is exposed for testing');
  const one = (labels, decision) => labels.filter((entry) => entry.split(',').includes(decision)).length;
  let rows;
  let out;

  // 1. Regulation win: a starter past 5 innings keeps the win; the closer who
  //    protected a 2-run lead gets the save.
  rows = [pitcherRow('Starter', 18, 2), pitcherRow('Setup', 3, 0, 3), pitcherRow('Closer', 3, 0, 2)];
  out = labelsOf(decide(rows, true, 2, { isHome: true }));
  assert.strictEqual(out[0], 'W', 'regulation win goes to a starter with 6 IP: ' + JSON.stringify(out));
  assert.strictEqual(out[2], 'SV', 'closer protecting a 2-run lead earns the save: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'W'), 1, 'exactly one win: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'SV'), 1, 'exactly one save: ' + JSON.stringify(out));

  // 2. Pitcher of record changes: a starter who fails to complete 5 innings is
  //    NOT win-eligible, so the win moves to the first reliever.
  rows = [pitcherRow('ShortStarter', 12, 4), pitcherRow('LongMan', 9, 0), pitcherRow('Closer', 3, 0, 2)];
  out = labelsOf(decide(rows, true, 2, { isHome: true }));
  assert.strictEqual(out[0], '', 'a starter with 4 IP is not win-eligible: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'W'), 1, 'the win moves to a reliever: ' + JSON.stringify(out));

  // 3. An ineligible DERIVED winner is still refused the win.
  rows = [pitcherRow('ShortStarter', 12, 4), pitcherRow('LongMan', 9, 0), pitcherRow('Closer', 3, 0, 2)];
  out = labelsOf(decide(rows, true, 2, { isHome: true, derivedWinPitcherName: 'ShortStarter' }));
  assert.strictEqual(out[0], '', 'a derived winner who is an ineligible starter is refused: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'W'), 1, 'the game still has exactly one winner: ' + JSON.stringify(out));

  // 4. An eligible derived winner IS honoured.
  rows = [pitcherRow('Starter', 21, 1), pitcherRow('Closer', 3, 0, 2)];
  out = labelsOf(decide(rows, true, 2, { isHome: true, derivedWinPitcherName: 'Starter' }));
  assert.strictEqual(out[0], 'W', 'an eligible derived winner keeps the win: ' + JSON.stringify(out));

  // 5. Extra innings: the starter never takes the decision.
  rows = [pitcherRow('Starter', 21, 3), pitcherRow('Middle', 3, 0), pitcherRow('Extras', 3, 0), pitcherRow('Final', 3, 0)];
  out = labelsOf(decide(rows, true, 1, { isHome: true, extra: true }));
  assert.strictEqual(out[0], '', 'an extra-inning win does not go to the starter: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'W'), 1, 'extra-inning win is awarded exactly once: ' + JSON.stringify(out));

  // 6. Walk-off: the home pitcher on the mound when the run scores takes the win.
  rows = [pitcherRow('Starter', 18, 3), pitcherRow('Reliever', 3, 0), pitcherRow('OnMound', 3, 0)];
  out = labelsOf(decide(rows, true, 1, { isHome: true, walkOff: true }));
  assert.strictEqual(out[2], 'W', 'a walk-off win goes to the pitcher on the mound: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'SV'), 0, 'a walk-off win has no save: ' + JSON.stringify(out));

  // 7. Walk-off: the visiting pitcher who gave up the run takes the loss.
  rows = [pitcherRow('Starter', 18, 2), pitcherRow('Setup', 3, 0), pitcherRow('GaveItUp', 0, 1)];
  out = labelsOf(decide(rows, false, 1, { isHome: false, walkOff: true }));
  assert.strictEqual(out[2], 'L', 'a walk-off loss goes to the pitcher who allowed it: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'L'), 1, 'exactly one loss: ' + JSON.stringify(out));

  // 8. Regulation loss defaults to the starter.
  rows = [pitcherRow('Starter', 18, 5), pitcherRow('Mop', 6, 1)];
  out = labelsOf(decide(rows, false, 3, { isHome: false }));
  assert.strictEqual(out[0], 'L', 'a regulation loss is charged to the starter: ' + JSON.stringify(out));

  // 9. Extra-inning loss goes to the reliever who gave up the deciding run.
  rows = [pitcherRow('Starter', 21, 2), pitcherRow('Bullpen', 6, 0), pitcherRow('LostIt', 3, 2)];
  out = labelsOf(decide(rows, false, 2, { isHome: false, extra: true }));
  assert.strictEqual(out[2], 'L', 'an extra-inning loss is not pinned on the starter: ' + JSON.stringify(out));

  // 10. No-save situation: a closer mopping up a blowout gets nothing.
  rows = [pitcherRow('Starter', 18, 0), pitcherRow('MopUp', 3, 1, 9)];
  out = labelsOf(decide(rows, true, 9, { isHome: true }));
  assert.strictEqual(one(out, 'SV'), 0, 'a 9-run lead is not a save situation: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'W'), 1, 'the win is still awarded: ' + JSON.stringify(out));

  // 11. Long-finish save: a multi-inning relief finish earns a save regardless of
  //     margin - but only when the starter was win-eligible, otherwise the win
  //     itself moves to that reliever and a pitcher cannot win and save one game.
  rows = [pitcherRow('Starter', 15, 1), pitcherRow('LongRelief', 12, 0, 8)];
  out = labelsOf(decide(rows, true, 8, { isHome: true }));
  assert.strictEqual(out[0], 'W', 'the 5-inning starter keeps the win: ' + JSON.stringify(out));
  assert.strictEqual(out[1], 'SV', 'a 4-inning relief finish earns the save: ' + JSON.stringify(out));
  // ... and when the starter is NOT win-eligible the long man takes the win instead,
  //     never both the win and the save.
  rows = [pitcherRow('ShortStarter', 12, 1), pitcherRow('LongRelief', 15, 0, 8)];
  out = labelsOf(decide(rows, true, 8, { isHome: true }));
  assert.strictEqual(out[1], 'W', 'the long man takes the win when the starter is short: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'SV'), 0, 'the winning pitcher is never also credited a save: ' + JSON.stringify(out));

  // 12. Blown save: a reliever who surrenders the lead he entered protecting.
  rows = [pitcherRow('Starter', 18, 1), pitcherRow('Blew', 3, 3, 2), pitcherRow('Closer', 3, 0, 1)];
  out = labelsOf(decide(rows, true, 1, { isHome: true }));
  assert(out[1].split(',').includes('BS'), 'a reliever who gives up the lead is charged a blown save: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'W'), 1, 'a blown save does not remove the win: ' + JSON.stringify(out));

  // 13. Hold: a reliever who protects a 1-3 run lead and hands it off cleanly.
  rows = [pitcherRow('Starter', 18, 1), pitcherRow('Held', 3, 0, 2), pitcherRow('Closer', 3, 0, 2)];
  out = labelsOf(decide(rows, true, 2, { isHome: true }));
  assert.strictEqual(out[1], 'HLD', 'a clean set-up appearance earns a hold: ' + JSON.stringify(out));
  assert.strictEqual(out[2], 'SV', 'the closer still earns the save: ' + JSON.stringify(out));
  assert.strictEqual(out[0], 'W', 'the starter still earns the win: ' + JSON.stringify(out));

  // 14. A starter is never credited a hold.
  rows = [pitcherRow('Starter', 6, 0, 2), pitcherRow('Closer', 21, 0, 2)];
  out = labelsOf(decide(rows, true, 2, { isHome: true }));
  assert(!out[0].split(',').includes('HLD'), 'a starter is never credited a hold: ' + JSON.stringify(out));

  // 15. Complete game: the only pitcher takes the decision and no save exists.
  out = labelsOf(decide([pitcherRow('CompleteGame', 27, 1)], true, 3, { isHome: true }));
  assert.strictEqual(out[0], 'W', 'a complete-game winner takes the win: ' + JSON.stringify(out));
  assert.strictEqual(one(out, 'SV'), 0, 'a complete game has no save: ' + JSON.stringify(out));
  out = labelsOf(decide([pitcherRow('CompleteGameLoss', 24, 4)], false, 3, { isHome: false }));
  assert.strictEqual(out[0], 'L', 'a complete-game loser takes the loss: ' + JSON.stringify(out));

  // 16. No pitcher rows at all: no decisions, and no crash.
  assert.deepStrictEqual(decide([], true, 2, { isHome: true }).labels, [], 'an empty staff produces no labels');

  // 17. A single pitcher never carries a duplicate label.
  [
    [[pitcherRow('A', 18, 1), pitcherRow('B', 3, 0, 2)], true, 2, { isHome: true }],
    [[pitcherRow('A', 18, 4), pitcherRow('B', 3, 1, 2)], false, 2, { isHome: false }],
    [[pitcherRow('A', 21, 2), pitcherRow('B', 3, 0), pitcherRow('C', 3, 0)], true, 1, { isHome: true, extra: true }],
  ].forEach(([staff, isWinner, margin, ctx]) => {
    labelsOf(decide(staff, isWinner, margin, ctx)).forEach((entry) => {
      const parts = entry.split(',').filter(Boolean);
      assert.strictEqual(new Set(parts).size, parts.length, 'no duplicate label on one pitcher: ' + entry);
    });
  });
}

(async () => {
  const { simulator, elements } = simulatorContext();
  assertDecisionRules(simulator);
  const modes = ['current', 'historical', 'mixed'];
  for (let index = 0; index < modes.length; index += 1) {
    const mode = modes[index];
    const result = chooseTeams(simulator, mode, index, index + 1);
    simulator.state.simulation = result;
    assertBoxScore(result);
    await simulator.runSimulation();
    assert.strictEqual(elements.boxScorePanel.getAttribute('data-box-score-state'), 'projected', mode + ' renders box score panel');
    assert(/<tr/.test(elements.boxScoreBody.innerHTML), mode + ' renders box score rows');
    assert(/FINAL/.test(elements.boxScoreMatchupCard.innerHTML), mode + ' renders final-status scoreboard card');
    assert(/not official MLB stats/.test(elements.boxScoreMatchupCard.innerHTML), mode + ' renders honest simulation label');
    assert(!/Key simulated moments|Game Summary|[A-Z]{2,3} Totals/i.test(elements.playerBoxScoreContent.innerHTML), mode + ' does not render removed summary/totals blocks');
    assert(/<h4>Batting<\/h4>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders batting section directly under line score');
    const battingDetailsIndex = elements.playerBoxScoreContent.innerHTML.search(/Batting, Baserunning (?:&amp;|&) Fielding/);
    assert(battingDetailsIndex >= 0, mode + ' renders batting details before pitching');
    assert(battingDetailsIndex < elements.playerBoxScoreContent.innerHTML.indexOf('<h4>Pitching</h4>'), mode + ' batting details appear above pitching');
    assert(/<h4>Pitching<\/h4>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders pitching section after batting details');
    assert(/Pitching (?:&amp;|&) Game Notes/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders compact game notes under pitching');
    ['2B:', '3B:', 'HR:', 'TB:', 'RBI:', '2-out RBI:', 'Runners left in scoring position, 2 out:', 'GIDP:', 'Team RISP:', 'Team LOB:', 'SB:', 'CS:', 'Pickoffs:', 'E:', 'Outfield assists:', 'DP:'].forEach((label) => {
      assert(elements.playerBoxScoreContent.innerHTML.includes(label), mode + ' batting details include ' + label);
    });
    ['Pitches-strikes:', 'Groundouts-flyouts:', 'Batters faced:'].forEach((label) => {
      assert(elements.playerBoxScoreContent.innerHTML.includes(label), mode + ' game notes include ' + label);
    });
    // Conditional row: inheritedRunnersLine() returns null when no reliever
    // inherited a runner (`if (!ir) return null;`), which is a perfectly normal
    // game, so demanding it unconditionally made this suite depend on the dice.
    // Require the shape whenever the row IS rendered - both clubs, an ir-irs
    // pair each - which is what would actually break if the accounting broke.
    // (Same rule the page suite applies; keep the two in step.)
    const inheritedRow = elements.playerBoxScoreContent.innerHTML
      .match(/Inherited runners-scored[^<]*<[^>]*>([^<]*)/);
    if (inheritedRow) {
      const inheritedValue = inheritedRow[1].trim();
      assert(/^[A-Z]{2,3} \d+-\d+; [A-Z]{2,3} \d+-\d+$/.test(inheritedValue),
        mode + ' inherited runners-scored reports an ir-irs pair for both clubs: ' + JSON.stringify(inheritedValue));
    }
    assert(!/Not verified for simulated output|Simulated neutral MLB environment|Simulated run time|Not used in this simulation|ABS Challenge|Umpires:|Weather:|Wind:|First pitch:|Attendance:|Venue:|Date:/.test(elements.playerBoxScoreContent.innerHTML), mode + ' game notes omit placeholder metadata');
    // Header cells carry class/title attributes now (tooltips, plus separate
    // THIS GAME vs season rate columns), so match the column by its label.
    assert(/<th[^>]*>AVG<\/th>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders batting average column');
    assert(/<th[^>]*>OPS<\/th>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders OPS column');
    assert(/<th[^>]*>ERA<\/th>/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders simulated ERA column');
    assertCleanProjectedLineups(elements.playerBoxScoreContent.innerHTML, mode);
    assertPitcherDecisions(elements.playerBoxScoreContent.innerHTML, simulator.state.simulation.boxScore, mode);
    assert(/Totals/.test(elements.playerBoxScoreContent.innerHTML), mode + ' renders table totals rows');
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

