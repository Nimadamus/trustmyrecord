'use strict';
/* NFL_ONE_PROJECTION_20261105. Ravens read 20% on the season page and 6% on the playoff page with
   one timestamp (audit 11/05 F1): the shock existed on one page, and the first builder read an
   older snapshot. Each case below fails on the old code. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../static/js/nfl-playoff-engine.js');
const N = require('../static/js/nfl-season-project.js');
const BI = require('../scripts/nfl-bake-inputs.js');
const AG = require('../scripts/nfl-pages-agree.js');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const d = JSON.parse(read('nfl-playoff-simulator/data/playoff-inputs-2026.json'));
let n = 0;
const ok = async (name, fn) => { await fn(); n += 1; console.log('  ok  ' + name); };

(async () => {
  await ok('the browser playoff odds and the season projection are the same draw, to the digit', () => {
    const a = N.project(d, 400, 20261105);
    const b = E.simulateSeason(d.teams, d.games, {}, 400, 20261105);
    a.teams.forEach((t) => {
      assert.strictEqual(b.probabilities[t.id].playoff, t.playoffs, t.id + ' playoffs');
      assert.strictEqual(b.probabilities[t.id].topSeed, t.top_seed, t.id + ' 1 seed');
    });
  });
  await ok('the bracket draws do not move the regular season numbers', () => {
    const a = E.simulateSeason(d.teams, d.games, {}, 150, 7);
    const b = E.simulateSeason(d.teams, d.games, {}, 150, 7, { withBracket: true });
    d.teams.forEach((t) => assert.strictEqual(a.probabilities[t.id].playoff, b.probabilities[t.id].playoff));
  });
  await ok('sigma is on by default in simulateSeason, and sigma 0 is the old narrow draw', () => {
    const on = E.simulateSeason(d.teams, d.games, {}, 500, 3);
    const off = E.simulateSeason(d.teams, d.games, {}, 500, 3, { sigma: 0 });
    const sure = (r) => d.teams.filter((t) => r.probabilities[t.id].playoff > 0.97 || r.probabilities[t.id].playoff < 0.03).length;
    assert.ok(sure(on) < sure(off), `shock must widen the odds: ${sure(on)} vs ${sure(off)} clubs near certain`);
    assert.strictEqual(N.SIGMA, E.STRENGTH_SIGMA, 'one constant');
  });
  await ok('the playoff builder has no simulation loop of its own', () => {
    const s = read('scripts/build_nfl_playoff_page.js');
    assert.ok(/N\.project\(d, n, N\.bakeSeed\(d\)\)/.test(s));
    assert.ok(!/E\.seedAll\(d\.teams, d\.games, null, sims\)/.test(s), 'the old loop');
    assert.ok(/N\.project\(d, RUNS, N\.bakeSeed\(d\)\)/.test(read('scripts/build_nfl_season_page.js')));
    assert.ok(/N\.project\(d, RUNS, /.test(read('scripts/build_nfl_team_pages.js')));
  });
  await ok('the bake reads the inputs once and hands the same file to every NFL builder', () => {
    const w = read('.github/workflows/league-sim-bake.yml');
    assert.ok(/node scripts\/nfl-bake-inputs\.js \.nfl-inputs\.json/.test(w));
    ['build_nfl_season_page', 'build_nfl_team_pages', 'build_nfl_playoff_page'].forEach((b) => {
      assert.ok(new RegExp('node scripts/' + b + '\\.js --inputs \\.nfl-inputs\\.json').test(w), b);
    });
    assert.ok(/node scripts\/nfl-pages-agree\.js/.test(w), 'the disagreement gate runs before the commit');
    assert.ok(w.indexOf('nfl-pages-agree') < w.indexOf('git add mlb-playoff-odds'));
  });
  await ok('a first read that predates the store is not used', async () => {
    const snap = (at, pending) => ({ projections_available: true, games: new Array(272), projections_generated_at: at, projection_restore_pending: pending, projection_state: 'ready' });
    const reads = [snap('old', true), snap('new', false), snap('new', false)];
    const got = await BI.settledRead(async () => reads.shift(), { wait: async () => {} });
    assert.strictEqual(got.projections_generated_at, 'new');
    assert.strictEqual(reads.length, 0, 'needs two reads naming the same snapshot');
    // an API without the flag: old then new then new still lands on new
    const r2 = [snap('old'), snap('new'), snap('new')];
    assert.strictEqual((await BI.settledRead(async () => r2.shift(), { wait: async () => {} })).projections_generated_at, 'new');
    await assert.rejects(BI.settledRead(async () => snap('x', true), { tries: 3, wait: async () => {} }));
  });
  await ok('the gate fails on the 11/05 Ravens case and passes when the pages agree', () => {
    const row = (name, w, dv, po, top) => `<th scope="row"><a class="lt"><span class="ln">${name}</span></a></th><td class="num">${w}</td><td class="rng">1 to 2</td><td class="p" style="--h:1">${dv}</td><td class="p">${po}</td><td class="p">${top}</td></tr>`;
    const prow = (name, w, dv, po, top) => `<tr><td><span class="lt"><span class="ln">${name}</span></span></td><td class="num">3-5</td><td class="num">${w}</td><td class="num">${dv}</td><td class="num">${top}</td><td class="num"><b>${po}</b></td></tr>`;
    const names = Array.from({ length: 32 }, (_, i) => 'Club' + i);
    const season = (bal) => '<!-- NFL_PROJ:a -->' + names.map((x, i) => row(x, '8.0', i ? '10%' : '4%', i ? '50%' : bal, '&lt;1%')).join('');
    const playoff = (bal, fp) => `<!-- NFL_PROJ:${fp} --><section id="odds">` + names.map((x, i) => prow(x, '8.0', i ? '10%' : '4%', i ? '50%' : bal, '<1%')).join('') + '</section>';
    assert.deepStrictEqual(AG.compare(season('12%'), playoff('12%', 'a')), []);
    assert.ok(AG.compare(season('20%'), playoff('6%', 'a')).some((p) => /Club0 playoffs: season page 20%, playoff page 6%/.test(p)));
    assert.ok(AG.compare(season('12%'), playoff('12%', 'b')).some((p) => /fingerprints differ/.test(p)));
  });
  await ok('published copy: QB line, hero, weather, recorder and holdout statements stay true', () => {
    const g = read('nfl-simulator/index.html');
    assert.ok(!/learned from completed games in the current season/.test(g), 'F4');
    assert.ok(!/Free with a TrustMyRecord account/.test(g), 'hero contradicts the run policy');
    assert.ok(/no account needed/.test(g.slice(g.indexOf('<h1'), g.indexOf('<h1') + 900)));
    assert.ok(!/held back and scored once/.test(g), 'F7');
    assert.ok(/Weather does not change the win probability/.test(g), 'F10');
    const s = read('scripts/build_nfl_season_page.js');
    assert.ok(!/held out on \$\{/.test(s), 'F5: that holdout tested another path');
    assert.ok(/next game only/.test(s), 'F8');
    assert.ok(!/never saw while being fitted/.test(read('scripts/nfl-accuracy-copy.js')), 'F7');
    assert.ok(!/twice a day/.test(read('scripts/build_nfl_team_pages.js')), 'L1');
  });
  await ok('a neutral site game is not written as a road game', () => {
    const s = read('static/js/nfl-season-picks.js');
    assert.ok(/g\.neutral \? 'vs' : 'at'/.test(s));
    assert.ok(/o\.neutral = true/.test(read('scripts/build_nfl_season_page.js')));
  });
  console.log('NFL_ONE_PROJECTION PASSED (' + n + ')');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
