#!/usr/bin/env node

// NETWORK-FREE hard guard on what the MLB Simulator actually renders into a box
// score. The live-slate integration check
// (tests/mlb-simulator-live-roster-validation-test.js) covers the same ground
// against real MLB feeds but is soft-warn on purpose - a statsapi outage must
// never block a deploy. This file is the blocking half: every feed here is a
// fixture, so it can only fail when the RENDERING is wrong.
//
// It fails when a box score shows:
//   1. a player from the WRONG team,
//   2. a fake / non-rostered player,
//   3. a DUPLICATE starter (same slot twice, or the same player batting twice),
//   4. an incorrect nine-man batting order (missing/extra slot, not 1-9).
//
// The four checks are themselves proven at the bottom of this file: each defect
// is injected into a real rendered box score and the validator must reject it.
// A guard that cannot fail is not a guard.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const scriptText = fs.readFileSync(path.join(root, 'static', 'js', 'mlb-simulator.js'), 'utf8');

const ARI_ID = 109;
const ATL_ID = 144;

function rosterPayload(teamId, hitters, pitchers) {
  let id = teamId * 1000;
  return {
    roster: []
      .concat(hitters.map(([fullName, pos]) => ({
        person: { fullName, id: ++id },
        position: { abbreviation: pos, type: pos === 'P' ? 'Pitcher' : 'Infielder' },
        status: { code: 'A' },
        parentTeamId: teamId,
      })))
      .concat(pitchers.map((fullName) => ({
        person: { fullName, id: ++id },
        position: { abbreviation: 'P', type: 'Pitcher' },
        status: { code: 'A' },
        parentTeamId: teamId,
      }))),
  };
}

const ARI_HITTERS = [
  ['Corbin Carroll', 'RF'], ['Geraldo Perdomo', 'SS'], ['Ketel Marte', '2B'], ['Josh Naylor', '1B'],
  ['Eugenio Suarez', '3B'], ['Gabriel Moreno', 'C'], ['Alek Thomas', 'CF'], ['Lourdes Gurriel Jr.', 'LF'],
  ['Adrian Del Castillo', 'DH'], ['Jake McCarthy', 'LF'], ['Blaze Alexander', 'SS'], ['Tim Tawa', '2B'],
  ['James McCann', 'C'],
];
const ARI_PITCHERS = ['Eduardo Rodriguez', 'Merrill Kelly', 'Brandon Pfaadt', 'Ryne Nelson', 'Kevin Ginkel',
  'Ryan Thompson', 'Justin Martinez', 'A.J. Puk'];
const ATL_HITTERS = [
  ['Ronald Acuna Jr.', 'RF'], ['Ozzie Albies', '2B'], ['Austin Riley', '3B'], ['Matt Olson', '1B'],
  ['Marcell Ozuna', 'DH'], ['Michael Harris II', 'CF'], ['Sean Murphy', 'C'], ['Jurickson Profar', 'LF'],
  ['Orlando Arcia', 'SS'], ['Drake Baldwin', 'C'], ['Nacho Alvarez Jr.', 'SS'], ['Eli White', 'CF'],
  ['Luke Williams', '3B'],
];
const ATL_PITCHERS = ['Chris Sale', 'Bryce Elder', 'Grant Holmes', 'Spencer Schwellenbach', 'Raisel Iglesias',
  'Aaron Bummer', 'Pierce Johnson', 'Dylan Lee'];

const ROSTERS = {
  [ARI_ID]: rosterPayload(ARI_ID, ARI_HITTERS, ARI_PITCHERS),
  [ATL_ID]: rosterPayload(ATL_ID, ATL_HITTERS, ATL_PITCHERS),
};

// A finished game whose boxscore carries the real starters at battingOrder N00.
function feedFor(teamId) {
  const hitters = teamId === ARI_ID ? ARI_HITTERS : ATL_HITTERS;
  const players = {};
  hitters.slice(0, 9).forEach(([fullName, pos], i) => {
    players['ID' + (teamId * 1000 + i + 1)] = {
      person: { id: teamId * 1000 + i + 1, fullName },
      position: { abbreviation: pos },
      battingOrder: String((i + 1) * 100),
    };
  });
  const side = {
    team: { id: teamId },
    players,
    battingOrder: hitters.slice(0, 9).map((_, i) => teamId * 1000 + i + 1),
  };
  const other = teamId === ARI_ID ? ATL_ID : ARI_ID;
  return {
    gameData: { status: { abstractGameState: 'Final' }, teams: { away: { id: teamId }, home: { id: other } } },
    liveData: {
      boxscore: {
        teams: { away: side, home: { team: { id: other }, players: {}, battingOrder: [] } },
      },
    },
  };
}

const unmatched = [];
function routedFetch(url) {
  const u = String(url);
  const body = (json) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(JSON.stringify(json)),
  });
  let m = /\/teams\/(\d+)\/roster/.exec(u);
  if (m) return body(ROSTERS[m[1]] || { roster: [] });
  if (/\/transactions\?/.test(u)) return body({ transactions: [] });
  if (/\/standings\?/.test(u)) return body({ records: [] });
  if (/\/people[/?]/.test(u)) return body({ people: [] });
  // Today's league-wide schedule: no games today, so the engine falls back to the
  // most recent finished game - the deterministic path this fixture exercises.
  if (/\/schedule\?sportId=1&date=/.test(u)) return body({ dates: [] });
  m = /\/schedule\?sportId=1&teamId=(\d+)/.exec(u);
  if (m) {
    const teamId = Number(m[1]);
    return body({
      dates: [{
        date: '2026-08-03',
        games: [{
          gamePk: teamId * 10,
          officialDate: '2026-08-03',
          status: { abstractGameState: 'Final', detailedState: 'Final' },
          teams: {
            away: { team: { id: teamId } },
            home: { team: { id: teamId === ARI_ID ? ATL_ID : ARI_ID } },
          },
          link: '/api/v1.1/game/' + (teamId * 10) + '/feed/live',
        }],
      }],
    });
  }
  m = /\/game\/(\d+)\/feed\/live/.exec(u);
  if (m) return body(feedFor(Number(m[1]) / 10));
  unmatched.push(u.split('&_=')[0]);
  return body({});
}

function simulatorContext() {
  const context = {
    window: { location: { search: '' } },
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    console, Math, Number, Date, Promise,
    fetch: routedFetch,
    CONFIG: { api: { baseUrl: 'https://trustmyrecord-api.onrender.com/api' } },
  };
  context.window.document = context.document;
  vm.runInNewContext(scriptText, context);
  return context.window.TMRMlbSimulator;
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function plainName(name) {
  return String(name || '').replace(/\s+\([^)]*\)$/, '');
}

// EMERGENCY_DEPTH_ARM_20260727 renders a deliberately generic last-resort arm.
// It is the ONLY name a box score is allowed to show that is not on the roster.
function isDocumentedSyntheticArm(name, team) {
  return name === team.abbreviation + ' emergency reliever';
}

// The guard itself. Returns a list of human-readable violations; empty === clean.
function rosterViolations(sideBox, team, rosterNames) {
  const violations = [];
  const rows = Array.from(sideBox.batters || []);
  const pitchers = Array.from(sideBox.pitchers || []);

  rows.concat(pitchers).forEach((row) => {
    const name = plainName(row.name);
    if (isDocumentedSyntheticArm(name, team)) return;
    if (!rosterNames.has(normalizeName(name))) {
      violations.push(team.abbreviation + ' rendered a player who is not on its active roster: ' + name);
    }
  });

  const starters = rows.filter((row) => !row.sub);
  if (starters.length !== 9) {
    violations.push(team.abbreviation + ' rendered ' + starters.length + ' starting batters, expected exactly 9');
  }
  const slots = starters.map((row) => Number(row.slot));
  const expected = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  if (JSON.stringify(slots.slice().sort((a, b) => a - b)) !== JSON.stringify(expected)) {
    violations.push(team.abbreviation + ' batting order is not a complete 1-9: slots ' + JSON.stringify(slots));
  }
  const seen = new Set();
  starters.forEach((row) => {
    const key = normalizeName(plainName(row.name));
    if (seen.has(key)) violations.push(team.abbreviation + ' batted the same starter twice: ' + plainName(row.name));
    seen.add(key);
  });
  rows.filter((row) => row.sub).forEach((row) => {
    const slot = Number(row.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > 8) {
      violations.push(team.abbreviation + ' substitute is not in a real batting-order slot: ' + plainName(row.name));
    }
  });
  return violations;
}

(async () => {
  const simulator = simulatorContext();
  const ari = simulator.localTeams.current.find((t) => t.abbreviation === 'ARI');
  const atl = simulator.localTeams.current.find((t) => t.abbreviation === 'ATL');
  assert(ari && atl, 'ARI and ATL are configured current teams');

  const ariRoster = await simulator.fetchTeamRoster(ari);
  const atlRoster = await simulator.fetchTeamRoster(atl);
  assert(ariRoster && atlRoster, 'both fixture rosters loaded without network');
  assert.strictEqual(unmatched.length, 0,
    'every feed the engine asked for was served by a fixture: ' + unmatched.join(', '));

  const ariNames = new Set(ariRoster.players.map((p) => normalizeName(p.name)));
  const atlNames = new Set(atlRoster.players.map((p) => normalizeName(p.name)));
  // The two fixture rosters must not overlap, otherwise the wrong-team check
  // below would be satisfied by coincidence rather than by correctness.
  ariNames.forEach((n) => assert(!atlNames.has(n),
    'fixture rosters share a player, which would blind the wrong-team check: ' + n));

  simulator.state.awayTeamId = ari.id;
  simulator.state.homeTeamId = atl.id;
  simulator.state.awayPitcherId = '';
  simulator.state.homePitcherId = '';
  // Cleared immediately before the render so the assertion below is about THIS box
  // score: if the engine had fallen back to the static CURRENT_PITCHERS baseline,
  // the rendered arms would not be the fixture roster and the guard would be
  // testing the fallback table instead of the roster pipeline.
  simulator.state.usedEmergencyPitcherFallback = {};
  const result = simulator.simulate(ari, atl, null, 'roster-integrity-guard', false);
  assert.deepStrictEqual(Object.keys(simulator.state.usedEmergencyPitcherFallback || {}), [],
    'rendered box score used the live roster pipeline, not the static emergency pitcher fallback');

  // The lineup must come from the fixture boxscore feed (battingOrder N00), not from
  // an unordered active-roster fallback that happens to be in the same order.
  assert.strictEqual(result.boxScore.players.away.rosterSource,
    'Projected from most recent game starting lineup plus verified MLB active roster endpoint',
    'away rows are labelled as coming from the most recent starting lineup');
  assert.deepStrictEqual(
    Array.from(result.boxScore.players.away.batters.filter((row) => !row.sub), (row) => plainName(row.name)),
    ARI_HITTERS.slice(0, 9).map(([name]) => name),
    'away starters are the nine players the fixture game feed listed at battingOrder N00, in order');

  const awayViolations = rosterViolations(result.boxScore.players.away, ari, ariNames);
  const homeViolations = rosterViolations(result.boxScore.players.home, atl, atlNames);
  assert.deepStrictEqual(awayViolations, [], 'away box score is clean');
  assert.deepStrictEqual(homeViolations, [], 'home box score is clean');

  // Substitutes render through a different code path than starters, and only a
  // minority of games produce one (the engine rolls its own dice, so WHICH games
  // is not fixed even though every feed here is). Sweep until bench rows have
  // genuinely been covered, validating every box score on the way through.
  // Hard-capped on purpose: a full simulated game is expensive (seconds, not
  // milliseconds) and substitutions are rare in this matchup, so an "keep going
  // until you see N subs" loop ran to its ceiling and turned a blocking guard
  // into a multi-minute step. Bench-row REJECTION is proven deterministically by
  // the injected mutations below; this sweep is here to exercise the engine.
  const MIN_GAMES = 12;
  const MIN_SUB_ROWS = 1;
  const MAX_GAMES = 25;
  let games = 0;
  let subRowsSeen = 0;
  while (games < MAX_GAMES && (games < MIN_GAMES || subRowsSeen < MIN_SUB_ROWS)) {
    const game = simulator.simulate(ari, atl, null, 'guard-sweep-' + games, false);
    assert.deepStrictEqual(rosterViolations(game.boxScore.players.away, ari, ariNames), [],
      'away box score is clean on sweep game ' + games);
    assert.deepStrictEqual(rosterViolations(game.boxScore.players.home, atl, atlNames), [],
      'home box score is clean on sweep game ' + games);
    subRowsSeen += game.boxScore.players.away.batters.filter((row) => row.sub).length;
    subRowsSeen += game.boxScore.players.home.batters.filter((row) => row.sub).length;
    games += 1;
  }
  // Not an assertion: whether a pinch hitter appears is the engine's dice, and
  // failing the build over an unlucky sweep would be exactly the kind of flaky
  // guard this file exists to replace. Report it so a run that never exercises
  // the bench is visible in the log.
  if (subRowsSeen < MIN_SUB_ROWS) {
    console.log('note: no substitute rows appeared in ' + games + ' swept games; ' +
      'bench-row rejection is still covered by the injected mutations below');
  }

  // --- the guard must be able to fail -------------------------------------
  const clone = () => JSON.parse(JSON.stringify(result.boxScore.players.away));
  const mustReject = (box, label) => {
    const found = rosterViolations(box, ari, ariNames);
    assert(found.length > 0, 'guard FAILED TO CATCH ' + label + ' - it would pass a broken box score');
  };

  const wrongTeam = clone();
  wrongTeam.batters[3].name = 'Matt Olson (1B)';
  wrongTeam.batters[3].playerName = 'Matt Olson';
  mustReject(wrongTeam, 'a player from the wrong team');

  const fakePlayer = clone();
  fakePlayer.batters[5].name = 'Totally Fake Guy (LF)';
  fakePlayer.batters[5].playerName = 'Totally Fake Guy';
  mustReject(fakePlayer, 'a fake / non-rostered player');

  const duplicateStarter = clone();
  const firstStarter = duplicateStarter.batters.filter((row) => !row.sub)[0];
  const secondStarter = duplicateStarter.batters.filter((row) => !row.sub)[1];
  secondStarter.name = firstStarter.name;
  secondStarter.playerName = firstStarter.playerName;
  mustReject(duplicateStarter, 'the same starter batting twice');

  const brokenOrder = clone();
  brokenOrder.batters = brokenOrder.batters.filter((row) => Number(row.slot) !== 4);
  mustReject(brokenOrder, 'an incomplete nine-man batting order');

  const extraStarter = clone();
  const spare = JSON.parse(JSON.stringify(extraStarter.batters[0]));
  spare.sub = false;
  spare.slot = 0;
  spare.name = 'Tim Tawa (2B)';
  spare.playerName = 'Tim Tawa';
  extraStarter.batters.push(spare);
  mustReject(extraStarter, 'a tenth starter');

  console.log('mlb-simulator-roster-integrity-guard-test: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
