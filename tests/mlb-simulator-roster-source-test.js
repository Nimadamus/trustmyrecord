#!/usr/bin/env node

// Deterministic proof that the MLB Simulator's roster/lineup rows come from the
// live MLB Stats API response shape (not stale hardcoded fixtures) and that the
// "confirmed lineup" claim is only made when the game is actually live/final.
// No network: feeds representative MLB Stats API payloads through the exported
// parsing functions. Added 2026-05-23 per realism/honesty requirements.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const scriptText = fs.readFileSync(path.join(root, 'static', 'js', 'mlb-simulator.js'), 'utf8');

function simulator() {
  const context = {
    window: { location: { search: '' } },
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    console, Math, Number, Date, Promise,
    fetch: () => Promise.reject(new Error('no network in unit test')),
    CONFIG: { api: { baseUrl: 'https://trustmyrecord-api.onrender.com/api' } },
  };
  context.window.document = context.document;
  vm.runInNewContext(scriptText, context);
  return context.window.TMRMlbSimulator;
}

const ARI = 109;
const ATL = 144;

// Mock MLB Stats API active-roster payload (statsapi /teams/:id/roster?rosterType=active)
const activeRosterPayload = {
  roster: [
    { person: { fullName: 'Corbin Carroll', id: 1 }, position: { abbreviation: 'RF' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Ketel Marte', id: 2 }, position: { abbreviation: '2B' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Eugenio Suarez', id: 3 }, position: { abbreviation: '3B' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Josh Naylor', id: 4 }, position: { abbreviation: '1B' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Gabriel Moreno', id: 5 }, position: { abbreviation: 'C' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Geraldo Perdomo', id: 6 }, position: { abbreviation: 'SS' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Alek Thomas', id: 7 }, position: { abbreviation: 'CF' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Lourdes Gurriel Jr.', id: 8 }, position: { abbreviation: 'LF' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Adrian Del Castillo', id: 9 }, position: { abbreviation: 'DH' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Zac Gallen', id: 10 }, position: { abbreviation: 'P' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Brandon Pfaadt', id: 11 }, position: { abbreviation: 'P' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Eduardo Rodriguez', id: 12 }, position: { abbreviation: 'P' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Merrill Kelly', id: 13 }, position: { abbreviation: 'P' }, status: { code: 'A' }, parentTeamId: ARI },
    { person: { fullName: 'Ryne Nelson', id: 14 }, position: { abbreviation: 'P' }, status: { code: 'A' }, parentTeamId: ARI },
    // A non-active player must be dropped (status code != 'A')
    { person: { fullName: 'Injured Bench Guy', id: 99 }, position: { abbreviation: '1B' }, status: { code: 'D60' }, parentTeamId: ARI },
  ],
};

const payloadActiveNames = activeRosterPayload.roster
  .filter((r) => r.status.code === 'A')
  .map((r) => r.person.fullName);

function lineupGame(state, lineupNames) {
  return {
    gamePk: 777,
    status: { abstractGameState: state, detailedState: state },
    teams: { away: { team: { id: ARI } }, home: { team: { id: ATL } } },
    lineups: {
      awayPlayers: lineupNames.map((name, i) => ({ fullName: name, id: 1000 + i, primaryPosition: { abbreviation: 'OF' } })),
      homePlayers: [],
    },
  };
}

const sim = simulator();
const ariTeam = sim.localTeams.current.find((t) => t.abbreviation === 'ARI');
assert(ariTeam, 'ARI is a configured current team');

// 1) Current teams carry NO embedded roster/lineup fixture — they must depend on the live endpoint.
sim.localTeams.current.forEach((team) => {
  assert(!team.players && !team.roster && !team.lineup && !team.battingOrder,
    team.name + ' must not embed a hardcoded roster/lineup fixture');
});

// 2) The roster endpoint is the live MLB Stats API active roster.
assert(/^https:\/\/statsapi\.mlb\.com\/api\/v1\/teams\/109\/roster\?rosterType=active/.test(sim.teamRosterUrl(ariTeam)),
  'ARI roster URL is the live MLB Stats API active-roster endpoint');

// 3) Active-roster fallback: names come straight from the payload; honestly labeled, never "confirmed".
const fallback = sim.collectMlbTeamRoster(activeRosterPayload, ariTeam, null);
assert(fallback, 'active roster parsed');
const fallbackNames = fallback.players.map((p) => p.name);
payloadActiveNames.forEach((name) => assert(fallbackNames.includes(name), 'parsed roster includes payload name: ' + name));
assert(!fallbackNames.includes('Injured Bench Guy'), 'non-active (D60) player is excluded');
assert.strictEqual(fallback.lineupStatus, 'roster', 'no lineup -> active-roster fallback status');
assert.strictEqual(fallback.lineupConfirmed, false, 'fallback is never marked confirmed');
assert(/active roster fallback/i.test(fallback.source), 'fallback source labeled honestly: ' + fallback.source);
assert(/not a set batting order/i.test(fallback.lineupBadge), 'fallback badge warns it is not a set batting order');

// 4) A FINAL game lineup is genuinely confirmed.
const confirmed = sim.todaysLineupForTeam([lineupGame('Final', payloadActiveNames.slice(0, 9))], ariTeam);
assert(confirmed, 'final-game lineup parsed');
assert.strictEqual(confirmed.confirmed, true, 'Final game lineup is confirmed');
assert.strictEqual(confirmed.lineupStatus, 'confirmed', 'Final game -> confirmed status');

// 5) A PREVIEW (pregame) lineup is posted, NOT confirmed (no false certainty).
const posted = sim.todaysLineupForTeam([lineupGame('Preview', payloadActiveNames.slice(0, 9))], ariTeam);
assert(posted, 'preview-game lineup parsed');
assert.strictEqual(posted.confirmed, false, 'pregame posted lineup is NOT claimed confirmed');
assert.strictEqual(posted.lineupStatus, 'posted', 'Preview game -> posted status');

// 6) Confirmed lineup drives the batting order and the confirmed label.
const expectedOrder = payloadActiveNames.slice(0, 9);
const confirmedRoster = sim.collectMlbTeamRoster(activeRosterPayload, ariTeam, confirmed);
assert.strictEqual(confirmedRoster.lineupConfirmed, true, 'confirmed lineup propagates to roster');
assert(/confirmed/i.test(confirmedRoster.source), 'confirmed roster source says confirmed: ' + confirmedRoster.source);
const orderedHitters = confirmedRoster.players
  .filter((p) => !/^(P|SP|RP|CP)$|Pitcher/i.test(String(p.position || '')))
  .slice(0, 9)
  .map((p) => p.name);
assert.deepStrictEqual(orderedHitters, expectedOrder, 'batting order follows the confirmed lineup order, not roster sort');

// 7) Posted lineup also yields a posted (not confirmed) roster label.
const postedRoster = sim.collectMlbTeamRoster(activeRosterPayload, ariTeam, posted);
assert.strictEqual(postedRoster.lineupConfirmed, false, 'posted lineup roster is not confirmed');
assert.strictEqual(postedRoster.lineupStatus, 'posted', 'posted lineup roster keeps posted status');
assert(/posted/i.test(postedRoster.source) && !/confirmed/i.test(postedRoster.source), 'posted roster source avoids the word confirmed');

console.log('mlb-simulator-roster-source-test: ok');
console.log(JSON.stringify({
  parsedActivePlayers: fallbackNames.length,
  fallbackSource: fallback.source,
  confirmedSource: confirmedRoster.source,
  postedSource: postedRoster.source,
}, null, 2));
