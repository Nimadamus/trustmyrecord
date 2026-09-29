/**
 * PLAYOFF_BRACKET_20260929: the bracket picker plays each league's real format.
 *   node tests/playoff-bracket-test.js
 */
'use strict';
const assert = require('assert');
const PB = require('../static/js/playoff-bracket.js');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('ok  ' + name); }

function teams(prefix, conf, n, divs) {
  const out = {};
  for (let i = 0; i < n; i++) {
    const id = prefix + (i + 1);
    out[id] = { n: id, s: id, c: conf, d: divs ? divs[i % divs.length] : conf, r: 100 - i };
  }
  return out;
}
function matrix(ids, p) {
  return { k: ids, p: ids.map((h) => ids.map((a) => (h === a ? 0.5 : p))) };
}

/* ---------------------------------------------------------------- NFL */
const nflTeams = Object.assign(teams('A', 'AFC', 16), teams('N', 'NFC', 16));
const nfl = {
  league: 'nfl', season: '2026', confs: ['AFC', 'NFC'], trophy: 'Super Bowl', teams: nflTeams,
  seeds: { AFC: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'], NFC: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7'] },
  prob: { r: Object.fromEntries(Object.keys(nflTeams).map((k) => [k, 0])), hfa: 0.2 },
};

t('nfl wild card is 2v7, 3v6, 4v5 and the 1 seed byes', () => {
  const b = PB.build(nfl, { seeds: nfl.seeds, picks: {} });
  const wc = b.confs.AFC.filter((m) => m.round === 0).map((m) => m.hi + 'v' + m.lo);
  assert.deepStrictEqual(wc, ['A2vA7', 'A3vA6', 'A4vA5']);
});

t('nfl divisional round reseeds: the 1 seed hosts the lowest seed left', () => {
  const picks = { 'A-wc-0': 'A7', 'A-wc-1': 'A3', 'A-wc-2': 'A5' };
  const b = PB.build(nfl, { seeds: nfl.seeds, picks });
  assert.strictEqual(b.byId['A-dv-0'].hi, 'A1');
  assert.strictEqual(b.byId['A-dv-0'].lo, 'A7');
  assert.strictEqual(b.byId['A-dv-1'].hi, 'A3');
  assert.strictEqual(b.byId['A-dv-1'].lo, 'A5');
});

t('nfl home field shows in a game and the Super Bowl is neutral', () => {
  const b = PB.build(nfl, PB.fill(nfl, { seeds: nfl.seeds, picks: {} }, 'fav'));
  assert.ok(b.byId['A-wc-0'].p > 0.5, 'equal clubs, the home side is favored');
  assert.ok(Math.abs(b.final.p - 0.5) < 1e-9, 'equal clubs at a neutral site are a coin flip');
  assert.ok(b.champion);
});

t('changing an early pick clears only the picks that depended on it', () => {
  let s = PB.fill(nfl, { seeds: nfl.seeds, picks: {} }, 'fav');
  const before = PB.build(nfl, s);
  const winner = before.byId['A-wc-0'].winner;
  const other = winner === 'A2' ? 'A7' : 'A2';
  s = PB.prune(nfl, { seeds: s.seeds, picks: Object.assign({}, s.picks, { 'A-wc-0': other }) });
  const after = PB.build(nfl, s);
  assert.strictEqual(after.byId['A-wc-0'].winner, other);
  assert.strictEqual(after.byId['N-wc-0'].winner, before.byId['N-wc-0'].winner, 'the other conference is untouched');
});

/* ---------------------------------------------------------------- NBA */
const nbaTeams = Object.assign(teams('E', 'Eastern', 15), teams('W', 'Western', 15));
const nbaIds = Object.keys(nbaTeams);
const nba = {
  league: 'nba', season: '2026-27', confs: ['Eastern', 'Western'], trophy: 'NBA title', teams: nbaTeams,
  seeds: { Eastern: nbaIds.slice(0, 10), Western: nbaIds.slice(15, 25) }, prob: matrix(nbaIds, 0.6),
};

t('nba play-in: 7v8 winner is the 7 seed, the 7v8 loser hosts the 9v10 winner for the 8 seed', () => {
  const picks = { 'E-pi-a': 'E8', 'E-pi-b': 'E10' };
  const b = PB.build(nba, { seeds: nba.seeds, picks });
  const c = b.byId['E-pi-c'];
  assert.strictEqual(c.hi, 'E7', 'the loser of 7 v 8 hosts');
  assert.strictEqual(c.lo, 'E10');
  const b2 = PB.build(nba, { seeds: nba.seeds, picks: Object.assign(picks, { 'E-pi-c': 'E10' }) });
  assert.strictEqual(b2.byId['E-r1-0'].lo, 'E10', 'the 8 seed plays the 1 seed');
  assert.strictEqual(b2.byId['E-r1-2'].lo, 'E8', 'the 7 seed plays the 2 seed');
});

t('nba first round is 1v8, 4v5, 2v7, 3v6 on a fixed bracket', () => {
  const s = PB.fill(nba, { seeds: nba.seeds, picks: {} }, 'fav');
  const b = PB.build(nba, s);
  const r1 = b.confs.Eastern.filter((m) => m.round === 0).map((m) => m.hi + 'v' + m.lo);
  assert.deepStrictEqual(r1, ['E1vE8', 'E4vE5', 'E2vE7', 'E3vE6']);
  assert.deepStrictEqual([b.byId['E-r2-0'].hi, b.byId['E-r2-0'].lo], ['E1', 'E4']);
});

t('best of seven math: even teams split, home court helps without deciding it', () => {
  const even = { league: 'nba', prob: matrix(['X', 'Y'], 0.5) };
  assert.ok(Math.abs(PB.seriesP(even, 'X', 'Y') - 0.5) < 1e-12);
  const strong = { league: 'nba', prob: { k: ['X', 'Y'], p: [[0.5, 0.7], [0.5, 0.5]] } };
  // X wins 70% at home, 50% away: better than a coin flip, less than 70%.
  const p = PB.seriesP(strong, 'X', 'Y');
  assert.ok(p > 0.6 && p < 0.8, String(p));
});

/* ---------------------------------------------------------------- NHL */
const nhlTeams = Object.assign(
  teams('M', 'Eastern', 8, ['Metropolitan']), teams('T', 'Eastern', 8, ['Atlantic']),
  teams('C', 'Western', 8, ['Central']), teams('P', 'Western', 8, ['Pacific']));
nhlTeams.T1.r = 120; // Atlantic winner has more points than the Metropolitan winner
const nhlIds = Object.keys(nhlTeams);
const nhl = {
  league: 'nhl', season: '2026-27', confs: ['Eastern', 'Western'], trophy: 'Stanley Cup', teams: nhlTeams,
  seeds: {
    Eastern: { divs: { Atlantic: ['T1', 'T2', 'T3'], Metropolitan: ['M1', 'M2', 'M3'] }, order: ['Atlantic', 'Metropolitan'], wc: ['M4', 'T4'] },
    Western: { divs: { Central: ['C1', 'C2', 'C3'], Pacific: ['P1', 'P2', 'P3'] }, order: ['Central', 'Pacific'], wc: ['C4', 'P4'] },
  },
  prob: matrix(nhlIds, 0.55),
};

t('nhl: the better division winner plays the second wild card, 2v3 inside each division', () => {
  const b = PB.build(nhl, { seeds: nhl.seeds, picks: {} });
  assert.deepStrictEqual([b.byId['E-0-r1-a'].hi, b.byId['E-0-r1-a'].lo], ['T1', 'T4']);
  assert.deepStrictEqual([b.byId['E-1-r1-a'].hi, b.byId['E-1-r1-a'].lo], ['M1', 'M4']);
  assert.deepStrictEqual([b.byId['E-0-r1-b'].hi, b.byId['E-0-r1-b'].lo], ['T2', 'T3']);
});

t('nhl: round two stays inside the division', () => {
  const s = PB.fill(nhl, { seeds: nhl.seeds, picks: {} }, 'fav');
  const b = PB.build(nhl, s);
  const r2 = b.byId['E-0-r2'];
  assert.ok([r2.hi, r2.lo].every((x) => nhlTeams[x].d === 'Atlantic' || x === 'T4'), r2.hi + ' ' + r2.lo);
  assert.ok(b.champion);
});

t('reorderNhl puts the division winner with more points first', () => {
  const seeds = JSON.parse(JSON.stringify(nhl.seeds));
  seeds.Eastern.order = ['Metropolitan', 'Atlantic'];
  PB.reorderNhl(nhl, seeds);
  assert.deepStrictEqual(seeds.Eastern.order, ['Atlantic', 'Metropolitan']);
});

t('share links round trip and a tampered seed list is rejected', () => {
  const s = PB.fill(nba, { seeds: nba.seeds, picks: {} }, 'fav');
  const back = PB.decode(PB.encode(s));
  assert.deepStrictEqual(back, JSON.parse(JSON.stringify(s)));
  const bad = JSON.parse(JSON.stringify(nba.seeds));
  bad.Eastern[1] = bad.Eastern[0];
  assert.strictEqual(PB.validSeeds(nba, bad), false);
  assert.strictEqual(PB.validSeeds(nba, nba.seeds), true);
});

t('the baked widget carries no raw < inside its JSON', () => {
  const html = PB.widget(nba, PB.fill(nba, { seeds: nba.seeds, picks: {} }, 'fav'));
  const json = html.split('<script type="application/json">')[1].split('</script>')[0];
  assert.ok(json.indexOf('<') < 0);
  assert.ok(/pb-champ/.test(html));
});

console.log(`\n${passed} passed`);
