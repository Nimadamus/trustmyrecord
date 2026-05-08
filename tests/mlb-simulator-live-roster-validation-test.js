#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'static', 'js', 'mlb-simulator.js'), 'utf8');

function simulatorContext() {
  const context = {
    window: { location: { search: '' } },
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; },
    },
    console,
    Math,
    Number,
    Date,
    Promise,
    fetch,
    CONFIG: { api: { baseUrl: 'https://trustmyrecord-api.onrender.com/api' } },
  };
  context.window.document = context.document;
  vm.runInNewContext(script, context);
  return context.window.TMRMlbSimulator;
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
}

function assertRealPlayer(player, team) {
  assert(player && player.name, team.name + ' player row has a name');
  assert(player.position, team.name + ' player ' + player.name + ' has a role or position');
  assert(String(player.teamId) === String(team.source.teamId), team.name + ' player ' + player.name + ' has the selected MLB team id');
  assert(!/Lineup Slot|Pitching Slot|Simulation Slot|Reliever [AB]|modeled|placeholder|baseline starter|staff game|TBD|Unknown/i.test(player.name), team.name + ' has no placeholder player name: ' + player.name);
  assert(!/^\s*$/.test(player.position), team.name + ' player ' + player.name + ' has a non-empty position');
}

function renderedNames(group) {
  return []
    .concat((group && group.batters) || [])
    .concat((group && group.pitchers) || [])
    .map((row) => row.name)
    .filter(Boolean)
    .map((name) => String(name).replace(/\s+\([A-Z0-9]+\)$/, ''));
}

(async () => {
  const simulator = simulatorContext();
  assert(simulator, 'simulator test API is available');
  assert.strictEqual(simulator.localTeams.current.length, 30, 'all 30 current MLB teams are configured');

  const teams = simulator.localTeams.current.map((team) => {
    const source = simulator.rosterSourceForTeam(team);
    assert(source.url.includes('https://statsapi.mlb.com/api/v1/teams/'), team.name + ' uses the MLB Stats API roster endpoint');
    assert(source.url.includes('/roster?rosterType=active'), team.name + ' uses the active roster type');
    assert(!source.url.includes('site.api.espn.com'), team.name + ' does not use ESPN roster names for current box-score rows');
    return Object.assign({ source }, team);
  });

  const rosters = {};
  for (const team of teams) {
    const roster = await simulator.fetchTeamRoster(team);
    assert(roster, team.name + ' loaded a verified current active roster');
    assert.strictEqual(String(roster.teamId), String(team.source.teamId), team.name + ' roster has the selected MLB team id');
    assert.strictEqual(roster.source, 'Verified MLB active roster endpoint', team.name + ' labels the live roster source');

    const pitchers = roster.players.filter((player) => /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || '')));
    const hitters = roster.players.filter((player) => !/^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || '')));
    assert(hitters.length >= team.source.minimumBatters, team.name + ' has enough current hitters for player box score rows');
    assert(pitchers.length >= team.source.minimumPitchers, team.name + ' has enough current pitchers for starter and relief pools');
    roster.players.forEach((player) => assertRealPlayer(player, team));

    const options = simulator.pitcherOptionsFor(team, 'away', null);
    assert(options.length >= 5, team.name + ' exposes at least five verified pitcher options after the roster loads');
    options.forEach((pitcher) => {
      assert(pitcher.verified, team.name + ' pitcher option is marked verified: ' + pitcher.name);
      assert(roster.players.some((player) => normalizeName(player.name) === normalizeName(pitcher.name)), team.name + ' pitcher option comes from the active roster: ' + pitcher.name);
    });

    rosters[team.abbreviation] = roster;
  }

  const sentinels = {
    ARI: ['Corbin Carroll'],
    ATL: ['Chris Sale'],
    KC: ['Bobby Witt Jr.'],
    LAD: ['Shohei Ohtani'],
    NYY: ['Aaron Judge'],
    SEA: ['Cal Raleigh'],
    SF: ['Logan Webb'],
    WSH: ['CJ Abrams'],
  };
  Object.entries(sentinels).forEach(([abbr, names]) => {
    const rosterNames = rosters[abbr].players.map((player) => normalizeName(player.name));
    names.forEach((name) => assert(rosterNames.includes(normalizeName(name)), abbr + ' live roster includes sentinel player ' + name));
  });

  assert(!rosters.ARI.players.some((player) => normalizeName(player.name) === normalizeName('Nolan Arenado')), 'Arizona roster rejects reported wrong-team Nolan Arenado row');

  teams.forEach((team, index) => {
    const opponent = teams[(index + 1) % teams.length];
    simulator.state.awayTeamId = team.id;
    simulator.state.homeTeamId = opponent.id;
    simulator.state.awayPitcherId = '';
    simulator.state.homePitcherId = '';
    const result = simulator.simulate(team, opponent, null, 'full-roster-' + team.abbreviation, false);
    assert(result.boxScore.players.away.rosterSource === 'Verified MLB active roster endpoint', team.name + ' rendered away player rows from the verified roster source');
    assert(result.boxScore.players.home.rosterSource === 'Verified MLB active roster endpoint', opponent.name + ' rendered home player rows from the verified roster source');

    const awayRosterNames = new Set(rosters[team.abbreviation].players.map((player) => normalizeName(player.name)));
    const homeRosterNames = new Set(rosters[opponent.abbreviation].players.map((player) => normalizeName(player.name)));
    renderedNames(result.boxScore.players.away).forEach((name) => {
      assert(awayRosterNames.has(normalizeName(name)), team.name + ' rendered player belongs to selected team roster: ' + name);
    });
    renderedNames(result.boxScore.players.home).forEach((name) => {
      assert(homeRosterNames.has(normalizeName(name)), opponent.name + ' rendered player belongs to selected team roster: ' + name);
    });
  });

  console.log('mlb-simulator-live-roster-validation-test: ok');
  console.log(JSON.stringify({
    uiBuild: simulator.uiBuild,
    source: 'MLB Stats API active roster endpoint',
    refresh: 'fetch cache no-store with UI build cache-buster',
    currentTeamsValidated: teams.map((team) => team.abbreviation),
    totalPlayers: Object.values(rosters).reduce((total, roster) => total + roster.players.length, 0),
    totalPitchers: Object.values(rosters).reduce((total, roster) => total + roster.players.filter((player) => /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || ''))).length, 0),
    totalHitters: Object.values(rosters).reduce((total, roster) => total + roster.players.filter((player) => !/^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || ''))).length, 0),
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
