'use strict';
/* nfl-season-picks-test.js -- NFL_SEASON_PICKS_20261030 / NFL_PICKS_LINK_20261030 /
   NFL_SEASON_STRENGTH_NOISE_20261030. Bake gate: node tests/nfl-season-picks-test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const E = require('../static/js/nfl-playoff-engine.js');
const N = require('../static/js/nfl-season-project.js');
const PK = require('../static/js/nfl-season-picks.js');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const d = JSON.parse(read('nfl-playoff-simulator/data/playoff-inputs-2026.json'));
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ok  ' + name); };

ok('a club hosts a given opponent once a season, so away-home names one game', () => {
  const seen = {};
  d.games.forEach((g) => { const k = E.gameKey(g); assert.ok(!seen[k], 'duplicate matchup ' + k); seen[k] = 1; });
});

const open = d.games.filter((g) => !g.completed);
const picks = {};
open.slice(0, 25).forEach((g, i) => { picks[g.id] = i % 2 ? g.home : g.away; });

ok('share links survive a reordered schedule and a changed feed id (the position bug)', () => {
  const code = E.encodePicks(d.games, picks);
  assert.ok(!/(^|\.)\d+-[ha](\.|$)/.test(code), 'links must not encode list positions: ' + code.slice(0, 40));
  const shuffled = d.games.slice().reverse().map((g) => Object.assign({}, g, { id: 'other_feed_' + g.id }));
  const back = E.decodePicks(shuffled, code);
  assert.strictEqual(Object.keys(back).length, 25);
  shuffled.forEach((g) => { const orig = picks[g.id.replace('other_feed_', '')]; if (orig) assert.strictEqual(back[g.id], orig); });
});

ok('old position links still decode, and picks on final games are dropped', () => {
  const g0 = d.games.findIndex((g) => !g.completed);
  const back = E.decodePicks(d.games, g0 + '-h');
  assert.strictEqual(back[d.games[g0].id], d.games[g0].home);
  const done = d.games.find((g) => g.completed);
  assert.deepStrictEqual(E.decodePicks(d.games, E.gameKey(done) + '-h'), {});
});

ok('Run locks the picks in: a pick is won in every simulated season', () => {
  const r0 = N.project(d, 300, 5, { sigma: 0 });
  const allAway = {}; open.forEach((g) => { allAway[g.id] = g.away; });
  const r = N.project(d, 300, 5, { picks: allAway });
  assert.strictEqual(r.picked, open.length);
  const s = E.seedAll(d.teams, d.games, allAway, null);
  r.teams.forEach((t) => {
    const o = s.standings[t.id].overall;
    assert.strictEqual(t.wins_p10, t.wins_p90, t.id + ' has no range once every game is picked');
    assert.strictEqual(t.wins_mean, o.w + o.t / 2);
    assert.strictEqual(t.playoffs, s[t.conference].seeds.indexOf(t.id) >= 0 ? 1 : 0);
  });
  assert.strictEqual(r.open, r0.open, 'played count in the stamp is unchanged by picks');
  assert.ok(/with your \d+ picks locked in/.test(N.stamp(r, d)));
});

ok('strength noise: sigma 0 is the old engine; noise widens the ranges', () => {
  const a = N.project(d, 600, 9, { sigma: 0 }), b = N.project(d, 600, 9, { sigma: 0.5 });
  const width = (r) => r.teams.reduce((s, t) => s + t.wins_p90 - t.wins_p10, 0);
  assert.ok(width(b) > width(a));
  assert.deepStrictEqual(N.project(d, 200, 3, { sigma: 0.5 }).teams, N.project(d, 200, 3, { sigma: 0.5 }).teams, 'same seed, same answer');
});

ok('baked markup equals the browser markup (no shift on hydrate)', () => {
  const html = read('nfl-season-simulator/index.html');
  const m = /<script type="application\/json" id="nflSeasonData">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'season data baked');
  const data = JSON.parse(m[1]);
  const w = PK.openWeeks(data)[0];
  const games = /<div class="picks" id="nspGames">([\s\S]*?)<\/div>\s*<div class="nsp-bar nsp-act">/.exec(html);
  assert.ok(games, 'games list baked');
  assert.strictEqual(games[1], PK.gamesHtml(data, { week: w, team: null }, {}));
  assert.ok(html.indexOf('id="nspSeeds">' + PK.seedsHtml(data, {}) + '</div>') > 0, 'seeds baked from the same code');
  assert.ok(/data-playoff-bracket/.test(html) && /"key":"tmr-nfl-season-bracket-/.test(html), 'bracket has its own saved state');
});

ok('picking is free, Run is a run: the disclosure comes from the one policy source', () => {
  const html = read('nfl-season-simulator/index.html');
  const P = require('../scripts/sim-run-policy.js');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  assert.ok(html.indexOf(P.INLINE) > 0 || html.indexOf(esc(P.INLINE)) > 0, 'season page states the run policy inline');
  assert.ok(/sim-run-gate\.js[^>]*data-sport="nfl_season"/.test(html), 'Run stays behind the gate');
  assert.ok(/data-nsp="run"/.test(html));
  const sim = read('static/js/nfl-season-sim.js');
  assert.ok(/TMRNflSeasonPicks\.current\(d\.games\)/.test(sim), 'Run reads the picks');
  assert.ok(!/runSucceeded|runFailed/.test(read('static/js/nfl-season-picks.js')), 'picking never settles a run');
});

ok('the playoff page uses the same matchup codec', () => {
  const s = read('static/js/nfl-playoff-sim.js');
  assert.ok(/E\.encodePicks\(S\.data\.games, S\.picks\)/.test(s) && /E\.decodePicks\(S\.data\.games, str\)/.test(s));
});

ok('title, H1, canonical and description of the season page are unchanged by the picker', () => {
  const html = read('nfl-season-simulator/index.html');
  assert.ok(/<title>NFL Season Simulator \d{4} \| Standings and Season Predictor<\/title>/.test(html));
  assert.ok(/<h1>NFL Season Simulator<\/h1>/.test(html));
  assert.ok(/<link rel="canonical" href="https:\/\/trustmyrecord\.com\/nfl-season-simulator\/" \/>/.test(html));
  assert.strictEqual((html.match(/<h1/g) || []).length, 1);
});

console.log('NFL_SEASON_PICKS PASSED (' + passed + ')');
