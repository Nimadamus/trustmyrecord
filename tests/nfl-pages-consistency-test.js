'use strict';
/* NFL page consistency guards (TMR sim remediation 2026-10-30, worker nfl).
   - NFL_PLAYOFF_FIT_ONE_METHOD_20261030: the bracket and the in-browser conference and Super Bowl
     odds use ONE fit (engine fitRatings); no copy may call playoff rounds coin flips.
   - NFL_CLINCH_COPY_20261030: an unchecked club is explained, never silently left blank.
   - SIM_DEFAULT: the season page's default run count is the count its tables publish.
   - NFL_SIM_CLS_20261030: the game simulator reserves the nav, the hero and the board note. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const E = require('../static/js/nfl-playoff-engine.js');

// --- one fit ---
const builder = read('scripts/build_nfl_playoff_page.js');
assert.ok(/const fitRatings = \(teams, games\) => E\.fitRatings\(teams, games\);/.test(builder), 'builder must use the engine fit');
assert.ok(!/function fitRatings/.test(builder), 'no second fit implementation in the builder');
const eng = read('static/js/nfl-playoff-engine.js');
assert.ok(!/rnd\(\) < 0\.5 \? a : bb/.test(eng) && !/rnd\(\) < 0\.5 \? champs/.test(eng), 'playoff rounds must not be coin flips');
for (const f of ['nfl-playoff-simulator/index.html', 'static/js/nfl-playoff-sim.js', 'scripts/build_nfl_playoff_page.js']) {
  const s = read(f).replace(/<!-- NFL_ACC_PLAYOFF:start -->[\s\S]*?<!-- NFL_ACC_PLAYOFF:end -->/, '');
  assert.ok(!/drawn as coin flips|treated as 50\/50|rounds are coin flips/i.test(s), f + ' still describes playoff rounds as coin flips');
}
// a strong club wins its conference more often than a weak one in the in-browser odds
const conf = ['AFC', 'NFC']; const teams = [];
conf.forEach((c) => ['E', 'N', 'S', 'W'].forEach((d) => [1, 2, 3, 4].forEach((k) => teams.push({ id: c[0] + d + k, conference: c, division: c + ' ' + d }))));
const games = []; let gid = 0;
teams.forEach((h) => teams.forEach((a) => {
  if (h.id >= a.id || h.conference !== a.conference || gid > 400) return;
  const sh = Number(h.id.slice(-1)), sa = Number(a.id.slice(-1));
  games.push({ id: 'g' + (gid++), week: 1, home: h.id, away: a.id, completed: false, home_win_prob: 1 / (1 + Math.exp(-(0.1 + (sa - sh) * 0.6))) });
}));
const fit = E.fitRatings(teams, games);
assert.ok(fit.r.AE1 > fit.r.AE4, 'fit orders clubs by the model probabilities');
assert.ok(E.matchupProb(fit, 'AE1', 'AE4', false) > 0.5 && E.matchupProb(fit, 'AE1', 'AE1', true) === 0.5);

// --- clinch copy ---
const many = Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, week: 18, home: 'AE1', away: 'AE2', completed: false }));
const c = E.clinchStatus(teams, many, {}, 'AE1', { cap: 4096 });
assert.strictEqual(c.exhaustive, false); assert.strictEqual(c.remaining, 20); assert.strictEqual(c.maxGames, 12);
assert.ok(/else if \(c\.remaining\) sec\.appendChild\(el\('p', 'clinch', 'Clinching and elimination are checked exactly once/.test(read('static/js/nfl-playoff-sim.js')));
assert.ok(/once 12 or fewer games league wide are left unpicked/.test(read('nfl-playoff-simulator/index.html')));

// --- season default ---
const sb = read('scripts/build_nfl_season_page.js');
assert.ok(/<option value="10000" selected>10,000<\/option>/.test(sb) && !/value="2000" selected/.test(sb), 'season default must be the published 10,000');
assert.ok(/const RUNS = Number\(argVal\('--runs'\)\) \|\| 10000;/.test(sb));

// --- CLS reservations on the game simulator ---
const sim = read('nfl-simulator/index.html');
assert.ok(/<div id="dsNavReserve" aria-hidden="true" style="height:calc\(70px \* var\(--home-nav-scale, 1\) \+ 1px\)"><\/div>/.test(sim), 'nav height reserved');
assert.ok(/<section class="feat" id="featured" aria-labelledby="featTitle">/.test(sim), 'hero visible (reserved) from the first frame');
assert.ok(/\.feat\{min-height:170px/.test(sim) && /<p id="boardAimNote"><\/p>/.test(sim));
assert.ok(sim.indexOf('data-roster-clock="nfl"') > sim.indexOf('<div id="games"'), 'roster clock sits below the game grid');
// --- NFL_ACC_NO_STALE_FALLBACK_20261030: no silent fallback to a frozen accuracy file ---
assert.ok(!sim.includes("get('/nfl-simulator/accuracy-ytd.json')"), 'the season-to-date table must not fall back to the static file');
// --- NFL_WP_PAIR_ROUNDING_20261030: paired win chances add up ---
const m = /const wpPair=[^\n]*/.exec(sim); assert.ok(m, 'wpPair helper');
const wpPair = new Function(m[0] + '\nreturn wpPair;')();
for (let i = 0; i <= 1000; i++) { const h = i / 1000; const [a, b] = wpPair(h, 1 - h); assert.strictEqual(a + b, 100, 'pair ' + h); const [c, d] = wpPair(1 - h, h); assert.strictEqual(c, b); assert.strictEqual(d, a); }
assert.deepStrictEqual(wpPair(0.605, 0.395), [61, 39]);
assert.strictEqual(wpPair(0.6, 0.395).reduce((x, y) => x + y), 100, 'with a 0.5% tie chance the pair still totals the rounded 100');
assert.ok(!sim.includes('${pct(homeWP)}</span>') && !sim.includes("{textContent:pct(wpv)+' to win'}"), 'paired displays use wpTxt');
console.log('NFL_PAGES_CONSISTENCY PASSED');
