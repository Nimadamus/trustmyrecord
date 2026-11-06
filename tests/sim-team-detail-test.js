#!/usr/bin/env node
// SIM_TEAM_DETAIL_20261105: every number in the folded table, from a hand worked fixture.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TD = require('../scripts/sim-team-detail.js');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ok  ' + name); };
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tmr-td-')), 'h.json');

const G = (home, away, hs, as, ot) => ({ home, away, final: hs != null, home_score: hs, away_score: as, extra_time: !!ot });
const nhlGames = [G('A', 'B', 3, 2), G('B', 'C', 2, 3, true), G('C', 'A', 1, 4), G('A', 'C'), G('B', 'A')];

ok('NHL records count an extra time loss as a point', () => {
  const r = TD.records(nhlGames.map((g) => ({ home: g.home, away: g.away, done: g.final, hs: g.home_score, as: g.away_score, ot: g.extra_time })));
  assert.deepStrictEqual([r.A.w, r.A.l, r.A.otl], [2, 0, 0]);
  assert.deepStrictEqual([r.B.w, r.B.l, r.B.otl], [0, 1, 1]);
  assert.strictEqual(TD.points(r.B), 1);
  assert.strictEqual(TD.winPct('nhl', r.B), 0.25);       // 1 point of 4
  assert.strictEqual(r.A.left, 2);
  // A still plays C (2 of 4 points = .5) and B (.25)
  assert.strictEqual(TD.foesLeft('nhl', r, 'A'), 0.375);
});
ok('NFL ties count half', () => {
  const r = TD.records([{ home: 'X', away: 'Y', done: true, hs: 10, as: 10 }, { home: 'X', away: 'Y', done: true, hs: 20, as: 10 }]);
  assert.strictEqual(TD.winPct('nfl', r.X), 0.75);
});
ok('the NHL line is the last club in: top three per division, then two wild cards', () => {
  const teams = [];
  ['D1', 'D2'].forEach((d, k) => { for (let i = 0; i < 8; i++) teams.push({ conference: 'E', division: d, points_mean: 110 - i * 4 - k }); });
  // D1 top 3: 110 106 102. D2 top 3: 109 105 101. Rest best two: 98, 97.
  assert.deepStrictEqual(TD.playoffLines(teams), { E: 97 });
});

const rows = [{ id: 'A', name: 'Alpha', playoffs: 0.624, title: 0.05, conference: 'E' }, { id: 'B', name: 'Beta', playoffs: 0.2, title: 0.002, conference: 'E' }];
ok('with one day of history there are no change columns', () => {
  const html = TD.detail({ sport: 'nba', rows, games: nhlGames, when: '2026-11-05T12:00:00Z', file: tmp });
  assert.ok(html.includes('Team detail') && !html.includes('>Day<'));
});
ok('a second bake the same day does not count as a day', () => {
  const html = TD.detail({ sport: 'nba', rows, games: nhlGames, when: '2026-11-05T23:00:00Z', file: tmp });
  assert.ok(!html.includes('>Day<'));
  assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(tmp, 'utf8')).nba), ['2026-11-05']);
});
ok('the next day shows printed odds minus printed odds', () => {
  const next = [{ ...rows[0], playoffs: 0.58 }, { ...rows[1], playoffs: 0.25 }];
  const html = TD.detail({ sport: 'nba', rows: next, games: nhlGames, when: '2026-11-06T20:00:00Z', file: tmp });
  assert.ok(html.includes('<th scope="row">Alpha</th><td>58%</td><td>-4</td>'), html);
  assert.ok(html.includes('<th scope="row">Beta</th><td>25%</td><td>+5</td>'));
  assert.ok(html.includes('points since Nov 5'));
});
ok('the day rolls on Pacific time, not UTC', () => assert.strictEqual(TD.dayOf('2026-11-06T05:00:00Z'), '2026-11-05'));
ok('NHL shows points needed of points left', () => {
  const html = TD.tableHtml({ sport: 'nhl', rows, games: nhlGames, lines: { E: 3 } });
  assert.ok(html.includes('To line'));
  assert.ok(html.includes('<td>0 of 4</td>'));      // A has 4 points, 2 games left
  assert.ok(html.includes('<td>2 of 2</td>'));      // B has 1 point, 1 game left
});
ok('a failure leaves the page without the module and the bake alive', () => {
  assert.strictEqual(TD.detail({ sport: 'nba', rows: null, games: [], when: '2026-11-05T12:00:00Z', file: tmp }), '');
});
ok('no market field is read', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'sim-team-detail.js'), 'utf8').split('\n').filter((l) => !/^\s*(\/\*|\*| )?.*No market input/.test(l)).join('\n');
  assert.ok(!/market|odds_|moneyline|spread|no_vig/i.test(src));
});
ok('published copy has no dashes', () => {
  const html = TD.tableHtml({ sport: 'nhl', rows, games: nhlGames, lines: { E: 3 } }).replace(/<style>.*?<\/style>/, '').replace(/<[^>]*>/g, ' ');
  assert.ok(!/[–—]/.test(html));
});

console.log(passed + ' passed, 0 failed');
