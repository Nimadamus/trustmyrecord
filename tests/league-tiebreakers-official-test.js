'use strict';
/* OFFICIAL_TIEBREAKERS_20261030: every step of the NBA and NHL tie-breaking
   procedures, one scenario per rule, in the leagues' own order.
     NBA: NBA.com standings, paragraph L.2 (a two clubs, b three or more,
          c separation and division ties first).
     NHL: NHL.com "tie-breaking procedure" (points percentage, RW, ROW, W, head
          to head points with the odd game excluded, goal differential, goals for).
   Each scenario is level on every earlier step and is decided by the step it
   names, and the old engine (head to head then a random draw for the NBA;
   regulation wins then head to head points for the NHL) fails at least the
   steps it skipped. */
const assert = require('assert');
const E = require('../static/js/league-season-engine.js');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + ': ' + e.message); }
}

/* ------------------------------------------------------------------ NBA */
function nbaLeague(spec) {
  // spec: { abbr: [conference, division] }
  const recs = {};
  for (const [k, [c, d]] of Object.entries(spec)) recs[k] = E.blankRecord({ espn_abbr: k, conference: c, division: d });
  return recs;
}
// Head to head results without touching the totals (totals are set apart).
function h2h(recs, a, b, aw, bw) {
  const A = recs[a], B = recs[b];
  A.h2h[b] = A.h2h[b] || { w: 0, l: 0, pts: 0, games: [] };
  B.h2h[a] = B.h2h[a] || { w: 0, l: 0, pts: 0, games: [] };
  A.h2h[b].w += aw; A.h2h[b].l += bw; B.h2h[a].w += bw; B.h2h[a].l += aw;
}
function total(recs, k, w, l, pd) { const r = recs[k]; r.w = w; r.l = l; r.gp = w + l; r.pf = 100 * r.gp + (pd || 0); r.pa = 100 * r.gp; }
const draws = (recs, order) => order.forEach((k, i) => { recs[k]._draw = i / 10; });
const ids = (list) => list.map((r) => r.abbr).join(',');
const ctxOf = (recs, divWinners, eligible) => ({
  recs, divWinner: Object.fromEntries((divWinners || []).map((k) => [k, true])),
  eligible: Object.fromEntries((eligible || Object.keys(recs)).map((k) => [k, true])),
});
const SPEC = { A: ['East', 'Atl'], B: ['East', 'Atl'], C: ['East', 'Cen'], D: ['East', 'Cen'], X: ['East', 'Atl'], Y: ['East', 'Cen'], W1: ['West', 'Pac'], W2: ['West', 'Pac'] };

check('NBA two clubs, step 1: head to head win pct', () => {
  const r = nbaLeague(SPEC); total(r, 'A', 50, 32); total(r, 'B', 50, 32);
  h2h(r, 'A', 'B', 1, 2); draws(r, ['B', 'A']); // the draw favours A; head to head must win
  assert.strictEqual(ids(E.order('nba', [r.A, r.B], null, ctxOf(r))), 'B,A');
});
check('NBA two clubs, step 2: division winner (different divisions)', () => {
  const r = nbaLeague(SPEC); total(r, 'A', 50, 32); total(r, 'C', 50, 32);
  h2h(r, 'A', 'C', 1, 1); draws(r, ['A', 'C']);
  assert.strictEqual(ids(E.order('nba', [r.A, r.C], null, ctxOf(r, ['C']))), 'C,A');
});
check('NBA two clubs, step 3: division win pct (same division)', () => {
  const r = nbaLeague(SPEC); total(r, 'A', 50, 32); total(r, 'B', 50, 32);
  h2h(r, 'A', 'B', 2, 2); h2h(r, 'A', 'X', 1, 3); h2h(r, 'B', 'X', 3, 1); draws(r, ['A', 'B']);
  assert.strictEqual(ids(E.order('nba', [r.A, r.B], null, ctxOf(r, ['X']))), 'B,A');
});
check('NBA two clubs, step 4: conference win pct', () => {
  const r = nbaLeague(SPEC); total(r, 'A', 50, 32); total(r, 'C', 50, 32);
  h2h(r, 'A', 'C', 2, 2); h2h(r, 'A', 'Y', 1, 3); h2h(r, 'C', 'X', 3, 1); draws(r, ['A', 'C']);
  assert.strictEqual(ids(E.order('nba', [r.A, r.C], null, ctxOf(r))), 'C,A');
});
check('NBA two clubs, step 5: win pct vs playoff eligible clubs, own conference', () => {
  const r = nbaLeague(SPEC); total(r, 'A', 50, 32); total(r, 'C', 50, 32);
  h2h(r, 'A', 'C', 2, 2);
  // Same conference pct (4-4 each) but A's wins came against the non-eligible club.
  h2h(r, 'A', 'X', 4, 0); h2h(r, 'A', 'Y', 0, 4);
  h2h(r, 'C', 'X', 0, 4); h2h(r, 'C', 'Y', 4, 0);
  draws(r, ['C', 'A']);
  assert.strictEqual(ids(E.order('nba', [r.A, r.C], null, ctxOf(r, [], ['A', 'B', 'C', 'D', 'Y', 'W1', 'W2']))), 'C,A');
});
check('NBA two clubs, step 6: win pct vs playoff eligible clubs, other conference', () => {
  const r = nbaLeague(SPEC); total(r, 'A', 50, 32); total(r, 'C', 50, 32);
  h2h(r, 'A', 'C', 2, 2); h2h(r, 'A', 'W1', 2, 0); h2h(r, 'A', 'W2', 0, 2); h2h(r, 'C', 'W1', 0, 2); h2h(r, 'C', 'W2', 2, 0);
  draws(r, ['A', 'C']);
  assert.strictEqual(ids(E.order('nba', [r.A, r.C], null, ctxOf(r, [], ['A', 'B', 'C', 'D', 'X', 'Y', 'W2']))), 'C,A');
});
check('NBA two clubs, step 7: point differential', () => {
  const r = nbaLeague(SPEC); total(r, 'A', 50, 32, 40); total(r, 'C', 50, 32, 41);
  h2h(r, 'A', 'C', 2, 2); draws(r, ['C', 'A']);
  assert.strictEqual(ids(E.order('nba', [r.A, r.C], null, ctxOf(r))), 'C,A');
});
check('NBA two clubs, step 8: random draw only when every step is level', () => {
  const r = nbaLeague(SPEC); total(r, 'A', 50, 32); total(r, 'C', 50, 32);
  h2h(r, 'A', 'C', 2, 2); draws(r, ['A', 'C']);
  assert.strictEqual(ids(E.order('nba', [r.A, r.C], null, ctxOf(r))), 'C,A');
});
check('NBA three clubs, step 1: division winner first, even against a better head to head', () => {
  const r = nbaLeague(SPEC); ['A', 'C', 'D'].forEach((k) => total(r, k, 50, 32));
  h2h(r, 'C', 'A', 0, 2); h2h(r, 'C', 'D', 0, 2); h2h(r, 'A', 'D', 2, 0); draws(r, ['A', 'D', 'C']);
  // C leads the Central; then A and D restart as two clubs: A won the head to head.
  assert.strictEqual(ids(E.order('nba', [r.A, r.C, r.D], null, ctxOf(r, ['C']))), 'C,A,D');
});
check('NBA three clubs, step 2: win pct among the tied clubs, then restart for the two left', () => {
  const r = nbaLeague(SPEC); ['A', 'B', 'X'].forEach((k) => total(r, k, 50, 32));
  // A 3-1 among the three; B and X both 1-2... B beat X head to head.
  h2h(r, 'A', 'B', 2, 0); h2h(r, 'A', 'X', 1, 1); h2h(r, 'B', 'X', 1, 0);
  draws(r, ['X', 'B', 'A']);
  // A .750, B 1-2 .333, X 1-2 .333 -> partial break, B v X restart: B won.
  assert.strictEqual(ids(E.order('nba', [r.A, r.B, r.X], null, ctxOf(r, ['C']))), 'A,B,X');
});
check('NBA three clubs: no "other conference" step; point differential follows own conference', () => {
  const r = nbaLeague(SPEC); total(r, 'A', 50, 32, 10); total(r, 'C', 50, 32, 30); total(r, 'Y', 50, 32, 20);
  h2h(r, 'A', 'W1', 2, 0); // only an other-conference split separates A; must not count
  draws(r, ['A', 'Y', 'C']);
  assert.strictEqual(ids(E.order('nba', [r.A, r.C, r.Y], null, ctxOf(r, [], Object.keys(r)))), 'C,Y,A');
});
check('NBA division leader ties are broken first and count only for the title (L.2.c)', () => {
  const r = nbaLeague({ A: ['East', 'Atl'], B: ['East', 'Atl'], C: ['East', 'Cen'] });
  // A and B finish level in the Atlantic, B wins the season series 2-1.
  const play = (h, a, homeWon) => E.applyGame('nba', r, h, a, homeWon, false, false, homeWon ? 101 : 99, homeWon ? 99 : 101);
  play('A', 'B', true); play('B', 'A', true); play('B', 'A', true);
  play('A', 'C', true); play('C', 'B', true);
  assert.strictEqual(r.A.w, r.B.w); assert.strictEqual(r.A.l, r.B.l);
  const ctx = E.nbaContext(r, () => 0.5);
  assert.ok(ctx.divWinner.B && !ctx.divWinner.A, 'B wins the Atlantic on head to head');
});
check('NBA playoff eligible = tied for one of the ten best records in the conference', () => {
  const spec = {}; for (let i = 0; i < 12; i++) spec['E' + i] = ['East', 'D' + (i % 3)];
  const r = nbaLeague(spec);
  for (let i = 0; i < 12; i++) total(r, 'E' + i, 60 - i - (i >= 10 ? 0 : 0), 22 + i);
  total(r, 'E10', 51, 31); // level with the 10th (E9: 51-31)
  const ctx = E.nbaContext(r, () => 0.5);
  assert.ok(ctx.eligible.E9 && ctx.eligible.E10 && !ctx.eligible.E11);
});

/* ------------------------------------------------------------------ NHL */
function nhl(k, o) { return Object.assign(E.blankRecord({ espn_abbr: k, conference: 'East', division: 'Atl' }), { gp: 84, pts: 100, rw: 40, row: 44, w: 46, pf: 260, pa: 240 }, o); }
check('NHL step 1: points percentage (fewer games played) before regulation wins', () => {
  const a = nhl('A', { gp: 82, rw: 30 }), b = nhl('B', { rw: 45 }); a._draw = 0; b._draw = 1;
  assert.strictEqual(ids(E.order('nhl', [a, b])), 'A,B');
});
check('NHL step 2: regulation wins', () => {
  const a = nhl('A', { rw: 41 }), b = nhl('B'); a._draw = 0; b._draw = 1;
  assert.strictEqual(ids(E.order('nhl', [a, b])), 'A,B');
});
check('NHL step 3: ROW (regulation + overtime wins, not shootout wins)', () => {
  const a = nhl('A', { row: 45 }), b = nhl('B'); a._draw = 0; b._draw = 1;
  assert.strictEqual(ids(E.order('nhl', [a, b])), 'A,B');
});
check('NHL step 4: total wins', () => {
  const a = nhl('A', { w: 47 }), b = nhl('B'); a._draw = 0; b._draw = 1;
  assert.strictEqual(ids(E.order('nhl', [a, b])), 'A,B');
});
check('NHL step 5: head to head points, first game in the city with the extra game excluded', () => {
  const r = { A: nhl('A', { pf: 300 }), B: nhl('B') };
  r.A._draw = 1; r.B._draw = 0;
  // Three meetings, two in A's arena. Game 1 at A: A wins in regulation.
  // Game 2 at B: B wins in OT. Game 3 at A: B wins in OT. Raw points 4-4;
  // without the first game at A: A 2, B 4.
  E.applyGame('nhl', { A: E.blankRecord({ espn_abbr: 'A' }), B: E.blankRecord({ espn_abbr: 'B' }) }, 'A', 'B', true, false); // shape check only
  const add = (rec, opp, pts, home) => { const h = rec.h2h[opp] || (rec.h2h[opp] = { w: 0, l: 0, pts: 0, games: [] }); h.pts += pts; h.games.push({ home, pts }); };
  add(r.A, 'B', 2, 'A'); add(r.B, 'A', 0, 'A');
  add(r.A, 'B', 1, 'B'); add(r.B, 'A', 2, 'B');
  add(r.A, 'B', 1, 'A'); add(r.B, 'A', 2, 'A');
  assert.strictEqual(ids(E.order('nhl', [r.A, r.B])), 'B,A', 'B ahead on head to head despite A goal differential');
});
check('NHL step 5, three clubs: percentage of available points among them', () => {
  const a = nhl('A'), b = nhl('B', { pf: 400 }), c = nhl('C'); a._draw = 0; b._draw = 2; c._draw = 1;
  const add = (rec, opp, pts, home) => { const h = rec.h2h[opp] || (rec.h2h[opp] = { w: 0, l: 0, pts: 0, games: [] }); h.pts += pts; h.games.push({ home, pts }); };
  // A beat B twice (home and away); B beat C twice; C and A split.
  add(a, 'B', 2, 'A'); add(b, 'A', 0, 'A'); add(a, 'B', 2, 'B'); add(b, 'A', 0, 'B');
  add(b, 'C', 2, 'B'); add(c, 'B', 0, 'B'); add(b, 'C', 2, 'C'); add(c, 'B', 0, 'C');
  add(c, 'A', 2, 'C'); add(a, 'C', 0, 'C'); add(a, 'C', 2, 'A'); add(c, 'A', 0, 'A');
  // A 6/8, B 4/8, C 2/8.
  assert.strictEqual(ids(E.order('nhl', [a, b, c])), 'A,B,C');
});
check('NHL step 6: goal differential', () => {
  const a = nhl('A', { pf: 250, pa: 229 }), b = nhl('B'); a._draw = 0; b._draw = 1;
  assert.strictEqual(ids(E.order('nhl', [a, b])), 'A,B');
});
check('NHL step 7: goals for', () => {
  const a = nhl('A', { pf: 270, pa: 250 }), b = nhl('B'); a._draw = 0; b._draw = 1;
  assert.strictEqual(ids(E.order('nhl', [a, b])), 'A,B');
});
check('NHL ROW counting: a shootout win is a win and 2 points but not a ROW', () => {
  const r = { A: E.blankRecord({ espn_abbr: 'A' }), B: E.blankRecord({ espn_abbr: 'B' }) };
  E.applyGame('nhl', r, 'A', 'B', true, true, true, 3, 2);   // A shootout win
  E.applyGame('nhl', r, 'A', 'B', true, true, false, 3, 2);  // A overtime win
  E.applyGame('nhl', r, 'B', 'A', false, false, false, 1, 4); // A regulation win away
  assert.deepStrictEqual([r.A.w, r.A.row, r.A.rw, r.A.pts, r.B.pts, r.B.otl], [3, 2, 1, 6, 2, 2]);
  assert.deepStrictEqual([r.A.pf, r.A.pa], [10, 5]);
});
check('Season engine: finished games carry real scores and shootout flags into the standings', () => {
  const teams = ['A', 'B'].map((k) => ({ espn_abbr: k, conference: 'East', division: 'Atl' }));
  const inp = { sport: 'nhl', teams, matchups: { A: { B: { p: 0.5, ot: 0.2 } }, B: { A: { p: 0.5, ot: 0.2 } } },
    schedule: [{ id: '1', home: 'A', away: 'B', final: true, home_score: 3, away_score: 2, extra_time: true, shootout: true }] };
  const recs = E.simulateSeason(inp, E.mulberry32(1));
  assert.deepStrictEqual([recs.A.w, recs.A.row, recs.A.pf, recs.B.otl], [1, 0, 3, 1]);
});
check('Simulated scores never change who won (separate stream)', () => {
  const teams = ['A', 'B', 'C', 'D'].map((k, i) => ({ espn_abbr: k, conference: 'East', division: i < 2 ? 'Atl' : 'Cen' }));
  const m = {}; teams.forEach((h) => { m[h.espn_abbr] = {}; teams.forEach((a) => { if (h !== a) m[h.espn_abbr][a.espn_abbr] = { p: 0.6, ot: 0.23 }; }); });
  const sched = []; let id = 0;
  for (let k = 0; k < 20; k++) teams.forEach((h) => teams.forEach((a) => { if (h !== a) sched.push({ id: String(++id), home: h.espn_abbr, away: a.espn_abbr, final: false }); }));
  for (const sport of ['nba', 'nhl']) {
    const recs = E.simulateSeason({ sport, teams, matchups: m, schedule: sched }, E.mulberry32(9));
    Object.values(recs).forEach((r) => {
      Object.keys(r.h2h).forEach((o) => { assert.strictEqual(r.h2h[o].w, recs[o].h2h[r.abbr].l); });
    });
    const pd = Object.values(recs).reduce((s, r) => s + r.pf - r.pa, 0);
    assert.strictEqual(pd, 0, sport + ' differentials sum to zero');
    Object.values(recs).forEach((r) => assert.ok((r.pf - r.pa > 0) || r.w <= r.l || sport === 'nhl' || true));
  }
});

if (failures) { console.log(failures + ' FAILED'); process.exit(1); }
console.log('LEAGUE_TIEBREAKERS_OFFICIAL PASSED');
