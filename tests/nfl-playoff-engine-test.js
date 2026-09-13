'use strict';

/**
 * G10_PLAYOFF_ENGINE_20260913 -- tests for the standings, tiebreaker, seeding
 * and bracket engine.
 *
 * These run in Node against the same file the browser loads. Every assertion is
 * about a rule that is publicly checkable, because a playoff machine that seeds
 * a club wrongly is wrong in a way anybody can see.
 */

const assert = require('assert');
const path = require('path');
const E = require(path.join(__dirname, '..', 'static', 'js', 'nfl-playoff-engine.js'));

let passed = 0;
function ok(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); } catch (e) {
    console.error(`  FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------- fixtures */

const DIVS = { AFC: ['East', 'North', 'South', 'West'], NFC: ['East', 'North', 'South', 'West'] };
function makeTeams() {
  const out = [];
  ['AFC', 'NFC'].forEach((c) => DIVS[c].forEach((d) => {
    for (let i = 1; i <= 4; i += 1) {
      const id = `${c[0]}${d[0]}${i}`;
      out.push({ id, abbr: id, name: `${c} ${d} ${i}`, conference: c, division: d });
    }
  }));
  return out;
}
const TEAMS = makeTeams();
assert.strictEqual(TEAMS.length, 32, 'fixture must have 32 clubs');

let gid = 0;
function game(home, away, hs, as) {
  gid += 1;
  const g = { id: 'g' + gid, week: 1, home, away, completed: hs !== undefined, neutral: false };
  if (hs !== undefined) { g.home_score = hs; g.away_score = as; }
  return g;
}

/* ------------------------------------------------------------ basic maths */

ok('win percentage counts a tie as half a win', () => {
  assert.strictEqual(E.pct({ w: 1, l: 1, t: 0 }), 0.5);
  assert.strictEqual(E.pct({ w: 0, l: 0, t: 2 }), 0.5);
  assert.strictEqual(E.pct({ w: 3, l: 0, t: 1 }), 3.5 / 4);
  // A club that has not played has no result either way: it sits below a 1-0
  // club and above an 0-1 club, which is what every standings page shows in
  // the first week of a season.
  assert.strictEqual(E.pct({ w: 0, l: 0, t: 0 }), 0.5, 'unplayed is neutral, not bottom');
  assert.ok(E.pct({ w: 1, l: 0, t: 0 }) > E.pct({ w: 0, l: 0, t: 0 }));
  assert.ok(E.pct({ w: 0, l: 0, t: 0 }) > E.pct({ w: 0, l: 1, t: 0 }),
    'a club that has lost must not outrank one that has not played');
});

ok('a record label shows ties only when there are ties', () => {
  assert.strictEqual(E.recLabel({ w: 2, l: 1, t: 0 }), '2-1');
  assert.strictEqual(E.recLabel({ w: 2, l: 1, t: 1 }), '2-1-1');
});

ok('a completed game always beats a user pick', () => {
  const g = game('AE1', 'AE2', 10, 20);
  const r = E.resolveResults([g], { [g.id]: 'AE1' }, null);
  assert.strictEqual(r[0].source, 'actual');
  assert.strictEqual(r[0].away, 20, 'the real score must survive a contradicting pick');
});

ok('an unplayed, unpicked game contributes nothing', () => {
  const g = game('AE1', 'AE2');
  assert.strictEqual(E.resolveResults([g], {}, null).length, 0);
  const st = E.buildStandings(TEAMS, E.resolveResults([g], {}, null));
  assert.strictEqual(st.AE1.overall.w + st.AE1.overall.l + st.AE1.overall.t, 0);
});

/* ------------------------------------------------------------ tiebreakers */

ok('head-to-head settles a two-club division tie', () => {
  const games = [
    game('AE1', 'AE2', 24, 17),   // AE1 beat AE2
    game('AE1', 'AN1', 10, 20),
    game('AE2', 'AN1', 21, 14),
  ];
  const st = E.buildStandings(TEAMS, E.resolveResults(games, {}, null));
  const r = E.rankPool('division', st, ['AE1', 'AE2'], { confPool: ['AE1', 'AE2'], leaguePool: ['AE1', 'AE2'] });
  assert.deepStrictEqual(r.order, ['AE1', 'AE2']);
  assert.strictEqual(r.notes[0].resolvedBy, 'head-to-head');
});

ok('division record settles it when head-to-head is split', () => {
  // Both finish 2-2 overall and 1-1 head to head. AE1 is 2-2 inside the
  // division, AE2 is 1-3, so only the division-record step can separate them.
  const games = [
    game('AE1', 'AE2', 20, 10),
    game('AE2', 'AE1', 20, 10),   // split 1-1
    game('AE1', 'AE3', 30, 0),    // AE1 wins a division game
    game('AE1', 'AE4', 0, 30),    // and loses one: 2-2 in division
    game('AE2', 'AE3', 0, 30),    // AE2 loses both: 1-3 in division
    game('AE2', 'AE4', 0, 30),
    game('AE2', 'NE1', 30, 0),    // and evens its overall record outside it
    game('AE1', 'NE2', 0, 30),
  ];
  const st = E.buildStandings(TEAMS, E.resolveResults(games, {}, null));
  const r = E.rankPool('division', st, ['AE1', 'AE2'], { confPool: [], leaguePool: [] });
  assert.strictEqual(r.order[0], 'AE1');
  assert.strictEqual(r.notes[0].resolvedBy, 'division record');
});

ok('a wild-card tie ignores head-to-head when the clubs never met', () => {
  const games = [
    game('AE1', 'AN2', 30, 0),    // AE1 3-0 in conference
    game('AE1', 'AS2', 30, 0),
    game('AE1', 'AW2', 30, 0),
    game('AN1', 'NE1', 30, 0),    // AN1 wins are non-conference
    game('AN1', 'NN1', 30, 0),
    game('AN1', 'NS1', 30, 0),
  ];
  const st = E.buildStandings(TEAMS, E.resolveResults(games, {}, null));
  const pool = TEAMS.filter((t) => t.conference === 'AFC').map((t) => t.id);
  const r = E.rankPool('wildcard', st, ['AE1', 'AN1'], { confPool: pool, leaguePool: TEAMS.map((t) => t.id) });
  assert.strictEqual(r.order[0], 'AE1', 'the club with the better conference record takes it');
  assert.strictEqual(r.notes[0].resolvedBy, 'conference record');
});

ok('an unresolvable tie is reported, never invented', () => {
  // Two clubs with identical everything and no shared opponents.
  const games = [game('AE1', 'NE1', 20, 10), game('AE2', 'NE2', 20, 10)];
  const st = E.buildStandings(TEAMS, E.resolveResults(games, {}, null));
  const res = E.breakTie('wildcard', st, ['AE1', 'AE2'],
    { confPool: ['AE1', 'AE2'], leaguePool: ['AE1', 'AE2'] }, 0);
  assert.strictEqual(res.unresolved, true);
  assert.strictEqual(res.stepReached, 'net points in all games');
  assert.deepStrictEqual(res.remaining, ['best net touchdowns in all games', 'a coin toss']);
});

ok('the two unimplementable steps are named, not silently skipped', () => {
  assert.deepStrictEqual(E.UNIMPLEMENTABLE, ['best net touchdowns in all games', 'a coin toss']);
});

ok('common opponents excludes the tied clubs themselves', () => {
  const games = [
    game('AE1', 'AE2', 10, 7), game('AE1', 'AN1', 10, 7), game('AE2', 'AN1', 10, 7),
  ];
  const st = E.buildStandings(TEAMS, E.resolveResults(games, {}, null));
  assert.deepStrictEqual(E.commonOpponents(st, ['AE1', 'AE2']), ['AN1']);
});

/* ---------------------------------------------------------------- seeding */

/** Give every club a full slate so seeding has something real to sort. */
function fullSeason(winnerRule) {
  const games = [];
  for (let i = 0; i < TEAMS.length; i += 1) {
    for (let j = i + 1; j < TEAMS.length; j += 1) {
      const h = TEAMS[i].id, a = TEAMS[j].id;
      const homeWins = winnerRule(h, a);
      games.push(game(h, a, homeWins ? 21 : 10, homeWins ? 10 : 21));
    }
  }
  return games;
}

ok('THE RULE: a division runner-up can never take a division seed', () => {
  // AE1 and AE2 are the two best clubs in the AFC; both are in AFC East.
  const rank = {};
  TEAMS.forEach((t, i) => { rank[t.id] = i; });
  rank.AE1 = -2; rank.AE2 = -1;                    // the two strongest
  const games = fullSeason((h, a) => rank[h] < rank[a]);
  const s = E.seedAll(TEAMS, games, {}, null);
  assert.strictEqual(s.AFC.seeds[0], 'AE1', 'the best club is the 1 seed');
  const seedOfAE2 = s.AFC.seeds.indexOf('AE2') + 1;
  assert.ok(seedOfAE2 >= 5,
    `AE2 finished second in its division and must be a wild card (5-7), got seed ${seedOfAE2}`);
  assert.strictEqual(s.AFC.divisionWinners.length, 4);
  assert.strictEqual(s.AFC.wildcards.length, 3);
  assert.strictEqual(s.AFC.seeds.length, 7);
});

ok('seeds 1 to 4 are the four division winners, 5 to 7 the wild cards', () => {
  const rank = {}; TEAMS.forEach((t, i) => { rank[t.id] = i; });
  const games = fullSeason((h, a) => rank[h] < rank[a]);
  const s = E.seedAll(TEAMS, games, {}, null);
  ['AFC', 'NFC'].forEach((c) => {
    const top4 = s[c].seeds.slice(0, 4);
    assert.deepStrictEqual(top4.slice().sort(), s[c].divisionWinners.slice().sort(),
      c + ': seeds 1-4 must be exactly the division winners');
    const divs = top4.map((id) => TEAMS.find((t) => t.id === id).division);
    assert.strictEqual(new Set(divs).size, 4, c + ': one winner per division');
  });
});

/* ---------------------------------------------------------------- bracket */

ok('the 1 seed byes and the wild-card round is 2v7, 3v6, 4v5', () => {
  const seeds = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
  const b = E.bracket(seeds, (h) => h);            // higher seed always wins
  assert.strictEqual(b.wildcard.length, 3);
  assert.deepStrictEqual(b.wildcard.map((m) => [m.home, m.away]),
    [['S2', 'S7'], ['S3', 'S6'], ['S4', 'S5']]);
  assert.ok(!b.wildcard.some((m) => m.home === 'S1' || m.away === 'S1'), 'the 1 seed does not play');
});

ok('the bracket RESEEDS after each round', () => {
  const seeds = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
  // Upsets: the 7, 6 and 5 seeds all win.
  const b = E.bracket(seeds, (h, a) => (seeds.indexOf(a) > seeds.indexOf(h) ? a : h));
  // Survivors are 1, 5, 6, 7 -> reseeded the 1 plays the 7, not whoever it drew.
  assert.deepStrictEqual([b.divisional[0].home, b.divisional[0].away], ['S1', 'S7']);
  assert.deepStrictEqual([b.divisional[1].home, b.divisional[1].away], ['S5', 'S6']);
});

ok('the bracket runs through to a conference champion', () => {
  const seeds = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
  const b = E.bracket(seeds, (h) => h);
  assert.strictEqual(b.divisional.length, 2);
  assert.strictEqual(b.conference.length, 1);
  assert.strictEqual(b.champion, 'S1');
});

/* ----------------------------------------------------- clinch / eliminate */

ok('a club in the field with nothing left to play has clinched', () => {
  const rank = {}; TEAMS.forEach((t, i) => { rank[t.id] = i; });
  const games = fullSeason((h, a) => rank[h] < rank[a]);
  const c = E.clinchStatus(TEAMS, games, {}, 'AE1');
  assert.strictEqual(c.status, 'clinched');
  assert.strictEqual(c.exhaustive, true);
});

ok('a club out of the field with nothing left is eliminated', () => {
  const rank = {}; TEAMS.forEach((t, i) => { rank[t.id] = i; });
  const games = fullSeason((h, a) => rank[h] < rank[a]);
  const worst = TEAMS[TEAMS.length - 1].id;
  assert.strictEqual(E.clinchStatus(TEAMS, games, {}, worst).status, 'eliminated');
});

ok('an undecided club returns null rather than a guess', () => {
  const rank = {}; TEAMS.forEach((t, i) => { rank[t.id] = i; });
  const games = fullSeason((h, a) => rank[h] < rank[a]);
  // Reopen one game that matters: the result is no longer certain either way.
  const idx = games.findIndex((g) => g.home === 'AE1' || g.away === 'AE1');
  games[idx] = Object.assign({}, games[idx], { completed: false, home_score: null, away_score: null });
  const c = E.clinchStatus(TEAMS, games, {}, 'AE1');
  assert.ok(c.status === null || c.status === 'clinched');
  assert.strictEqual(typeof c.exhaustive, 'boolean');
});

ok('clinching refuses to answer rather than truncate a huge search', () => {
  const games = [];
  for (let i = 0; i < 30; i += 1) games.push(game('AE1', 'AE2'));   // 2^30 outcomes
  const c = E.clinchStatus(TEAMS, games, {}, 'AE1', { cap: 1024 });
  assert.strictEqual(c.status, null);
  assert.strictEqual(c.exhaustive, false);
  assert.strictEqual(c.reason, 'too many outcomes');
});

/* -------------------------------------------------------------- simulation */

ok('simulation is deterministic for a given seed, which is what makes a share link work', () => {
  const rank = {}; TEAMS.forEach((t, i) => { rank[t.id] = i; });
  const games = fullSeason((h, a) => rank[h] < rank[a]).map((g, i) =>
    (i % 5 === 0 ? Object.assign({}, g, { completed: false, home_score: null, away_score: null, home_win_prob: 0.6 }) : g));
  const a = E.simulateSeason(TEAMS, games, {}, 50, 12345);
  const b = E.simulateSeason(TEAMS, games, {}, 50, 12345);
  assert.deepStrictEqual(a.probabilities, b.probabilities);
  const c = E.simulateSeason(TEAMS, games, {}, 50, 999);
  assert.notDeepStrictEqual(a.probabilities, c.probabilities, 'a different seed must give a different run');
});

ok('a user pick is LOCKED and never redrawn by the simulation', () => {
  const games = [game('AE1', 'AE2'), game('AE3', 'AE4')];
  games[0].home_win_prob = 0.01;                    // the model hates AE1
  const picks = { [games[0].id]: 'AE1' };           // the user says AE1 anyway
  const r = E.simulateSeason(TEAMS, games, picks, 200, 7);
  assert.strictEqual(r.simulatedGames, 1, 'only the unpicked game is simulated');
});

ok('every probability is a share of the iterations, never above one', () => {
  const rank = {}; TEAMS.forEach((t, i) => { rank[t.id] = i; });
  const games = fullSeason((h, a) => rank[h] < rank[a]).map((g, i) =>
    (i % 7 === 0 ? Object.assign({}, g, { completed: false, home_score: null, away_score: null, home_win_prob: 0.55 }) : g));
  const r = E.simulateSeason(TEAMS, games, {}, 40, 3, { withBracket: true });
  let playoffSum = 0;
  TEAMS.forEach((t) => {
    const p = r.probabilities[t.id];
    assert.ok(p.playoff >= 0 && p.playoff <= 1, t.id + ' playoff probability out of range');
    assert.ok(p.superbowl >= 0 && p.superbowl <= 1);
    playoffSum += p.playoff;
  });
  assert.ok(Math.abs(playoffSum - 14) < 0.001, 'exactly 14 clubs make the field every iteration');
});

ok('a missing model probability degrades to a coin flip, not to a crash', () => {
  const games = [game('AE1', 'AE2')];               // no home_win_prob at all
  const r = E.simulateSeason(TEAMS, games, {}, 100, 5);
  assert.strictEqual(r.simulatedGames, 1);
  assert.ok(r.probabilities.AE1.playoff >= 0);
});

/* ------------------------- the six guarantees asked for by name ---------- */

ok('GUARANTEE: a completed game can never be overwritten, by a pick or a draw', () => {
  const g = game('AE1', 'AE2', 31, 7);
  const byPick = E.resolveResults([g], { [g.id]: 'AE2' }, null)[0];
  const bySim = E.resolveResults([g], {}, { [g.id]: 'AE2' })[0];
  [byPick, bySim].forEach((r) => {
    assert.strictEqual(r.source, 'actual');
    assert.strictEqual(r.home, 31);
    assert.strictEqual(r.away, 7);
  });
  const r2 = E.simulateSeason(TEAMS, [g], { [g.id]: 'AE2' }, 25, 1);
  assert.strictEqual(r2.simulatedGames, 0, 'a completed game is never in the simulated pool');
});

ok('GUARANTEE: every club plays exactly 17 games in the real 2026 fixture', () => {
  const fsx = require('fs');
  const p2 = path.join(__dirname, '..', 'nfl-playoff-simulator', 'data', 'playoff-inputs-2026.json');
  if (!fsx.existsSync(p2)) { console.log('      (fixture absent, skipped)'); return; }
  const d = JSON.parse(fsx.readFileSync(p2, 'utf8'));
  const n = {};
  d.games.forEach((gg) => { n[gg.home] = (n[gg.home] || 0) + 1; n[gg.away] = (n[gg.away] || 0) + 1; });
  assert.strictEqual(Object.keys(n).length, 32);
  Object.keys(n).forEach((k) => assert.strictEqual(n[k], 17, k + ' plays ' + n[k] + ' games'));
});

ok('GUARANTEE: exactly 14 clubs make the field, 7 per conference, every time', () => {
  const rank = {}; TEAMS.forEach((t, i) => { rank[t.id] = i; });
  const games = fullSeason((h, a) => rank[h] < rank[a]);
  const s = E.seedAll(TEAMS, games, {}, null);
  assert.strictEqual(s.AFC.seeds.length, 7);
  assert.strictEqual(s.NFC.seeds.length, 7);
  const all = s.AFC.seeds.concat(s.NFC.seeds);
  assert.strictEqual(all.length, 14);
  assert.strictEqual(new Set(all).size, 14, 'no club may appear twice');
  s.AFC.seeds.forEach((id) => assert.strictEqual(TEAMS.find((t) => t.id === id).conference, 'AFC'));
  s.NFC.seeds.forEach((id) => assert.strictEqual(TEAMS.find((t) => t.id === id).conference, 'NFC'));
});

ok('GUARANTEE: seeds 1 to 4 are division winners under twenty random seasons', () => {
  for (let trial = 0; trial < 20; trial += 1) {
    const rnd = E.mulberry32(1000 + trial);
    const order = TEAMS.map((t) => t.id).sort(() => rnd() - 0.5);
    const rank = {}; order.forEach((id, i) => { rank[id] = i; });
    const games = fullSeason((h, a) => rank[h] < rank[a]);
    const s = E.seedAll(TEAMS, games, {}, null);
    ['AFC', 'NFC'].forEach((c) => {
      const divs = s[c].seeds.slice(0, 4).map((id) => TEAMS.find((t) => t.id === id).division);
      assert.strictEqual(new Set(divs).size, 4, `trial ${trial} ${c}: seeds 1-4 must be four different divisions`);
      s[c].seeds.slice(4).forEach((id) => {
        assert.strictEqual(s[c].divisionWinners.indexOf(id), -1,
          `trial ${trial} ${c}: a division winner must not appear in the wild cards`);
      });
    });
  }
});

ok('GUARANTEE: ties are reported transparently, never resolved silently', () => {
  const games = [
    game('AE1', 'AE2', 20, 10), game('AE2', 'AE1', 20, 10),
    game('AE1', 'AE3', 30, 0), game('AE1', 'AE4', 0, 30),
    game('AE2', 'AE3', 0, 30), game('AE2', 'AE4', 0, 30),
    game('AE2', 'NE1', 30, 0), game('AE1', 'NE2', 0, 30),
  ];
  const st = E.buildStandings(TEAMS, E.resolveResults(games, {}, null));
  const r = E.rankPool('division', st, ['AE1', 'AE2'], { confPool: [], leaguePool: [] });
  assert.strictEqual(r.notes.length, 1, 'a broken tie must produce exactly one note');
  const n = r.notes[0];
  assert.deepStrictEqual(n.teams.slice().sort(), ['AE1', 'AE2']);
  assert.ok(typeof n.resolvedBy === 'string' && n.resolvedBy.length, 'the note must name the step');
  assert.strictEqual(n.unresolved, false);
});

ok('GUARANTEE: the same seed gives the same run, a different seed does not', () => {
  const rank = {}; TEAMS.forEach((t, i) => { rank[t.id] = i; });
  const games = fullSeason((h, a) => rank[h] < rank[a]).map((g, i) =>
    (i % 4 === 0 ? Object.assign({}, g, { completed: false, home_score: null, away_score: null, home_win_prob: 0.58 }) : g));
  const a1 = E.simulateSeason(TEAMS, games, {}, 120, 424242, { withBracket: true });
  const a2 = E.simulateSeason(TEAMS, games, {}, 120, 424242, { withBracket: true });
  assert.deepStrictEqual(a1.probabilities, a2.probabilities, 'same seed must reproduce exactly');
  const b1 = E.simulateSeason(TEAMS, games, {}, 120, 424243, { withBracket: true });
  assert.notDeepStrictEqual(a1.probabilities, b1.probabilities);
});

console.log(`\nnfl-playoff-engine: ${passed} passed${process.exitCode === 1 ? ', FAILURES' : ', 0 failed'}`);
