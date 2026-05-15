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
    assert(source.lineupUrl.includes('https://statsapi.mlb.com/api/v1/schedule?'), team.name + ' uses the MLB Stats API schedule endpoint for recent lineups');
    assert(!source.url.includes('site.api.espn.com'), team.name + ' does not use ESPN roster names for current box-score rows');
    return Object.assign({ source }, team);
  });

  const rosters = {};
  for (const team of teams) {
    const roster = await simulator.fetchTeamRoster(team);
    assert(roster, team.name + ' loaded a verified current active roster');
    assert.strictEqual(String(roster.teamId), String(team.source.teamId), team.name + ' roster has the selected MLB team id');
    assert.strictEqual(roster.source, 'Official MLB recent starting batting order from boxscore plus verified MLB active roster endpoint', team.name + ' labels the live lineup source');
    assert.strictEqual(roster.lineupSource, 'Official MLB recent starting batting order from boxscore', team.name + ' loaded an official recent batting order');

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

  Object.entries(rosters).forEach(([abbr, roster]) => {
    const lineup = roster.players
      .filter((player) => Number.isFinite(Number(player.battingOrder)))
      .slice(0, 9);
    assert.strictEqual(lineup.length, 9, abbr + ' live roster includes nine official recent batting-order slots');
    assert.deepStrictEqual(lineup.map((player) => Number(player.battingOrder)), [100, 200, 300, 400, 500, 600, 700, 800, 900], abbr + ' official recent batting order is sorted 1 through 9');
  });

  teams.forEach((team, index) => {
    const opponent = teams[(index + 1) % teams.length];
    simulator.state.awayTeamId = team.id;
    simulator.state.homeTeamId = opponent.id;
    simulator.state.awayPitcherId = '';
    simulator.state.homePitcherId = '';
    const result = simulator.simulate(team, opponent, null, 'full-roster-' + team.abbreviation, false);
    assert(result.boxScore.players.away.rosterSource === 'Official MLB recent starting batting order from boxscore plus verified MLB active roster endpoint', team.name + ' rendered away player rows from the verified lineup source');
    assert(result.boxScore.players.home.rosterSource === 'Official MLB recent starting batting order from boxscore plus verified MLB active roster endpoint', opponent.name + ' rendered home player rows from the verified lineup source');

    assert.strictEqual(result.boxScore.players.away.batters.length, 9, team.name + ' renders exactly nine verified batting-order rows');
    assert.strictEqual(result.boxScore.players.home.batters.length, 9, opponent.name + ' renders exactly nine verified batting-order rows');
    result.boxScore.players.away.batters.concat(result.boxScore.players.home.batters).forEach((row) => {
      assert(!/projected|placeholder|slot|modeled/i.test(row.name), 'batting rows do not use invented player names: ' + row.name);
    });

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
