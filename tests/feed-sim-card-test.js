/**
 * FEED_SIM_CARD_20261114 -- the simulation card on a simulator Take, and the
 * agree / disagree controls in the composer.
 *
 *   node tests/feed-sim-card-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const feed = fs.readFileSync(path.join(root, 'static/js/feed-v2.js'), 'utf8');
const take = fs.readFileSync(path.join(root, 'static/js/tmr-take.js'), 'utf8');

// Lift the card functions out of feed-v2.js and run them on their own.
const start = feed.indexOf('function fvSimNum');
const end = feed.indexOf('function renderTextPost');
assert.ok(start > -1 && end > start, 'card functions are present');
const ctx = {
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  getDisplayName: (item) => item.display_name || item.username,
};
vm.createContext(ctx);
vm.runInContext(feed.slice(start, end) + '\nthis.fvSimCard = fvSimCard;', ctx);

const SIM = {
  run_id: '31852', sport: 'nfl', league: 'NFL', url: '/nfl-simulator/results/run/?id=31852',
  recorded_at: '2026-11-13T21:36:23.554Z', n_sims: 10000,
  away: { abbr: 'LAC', name: 'Los Angeles Chargers', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png' },
  home: { abbr: 'NYJ', name: 'New York Jets', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png' },
  predicted_winner: 'NYJ', projected_score: { away: 22, home: 25 }, simulated_game: { away: 15, home: 19 },
  win_probability: { away: 0.431, home: 0.569 }, margin: { team: 'NYJ', by: 2.2 }, total: 47,
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&minus;/g, '-').replace(/&rsquo;/g, "'").replace(/\s+/g, ' ');
const post = (o) => Object.assign({ username: 'nflfun', context_source: 'simulator', context_label: 'LAC @ NYJ simulation', context_url: '/nfl-simulator/' }, o);

// A linked run with no stated position: the result, no opinion attributed.
let html = ctx.fvSimCard(post({ sim: SIM }));
let t = text(html);
assert.ok(/22 Projected score .*25/.test(t), 'projected score');
assert.ok(/LAC 43%/.test(t) && /57% NYJ/.test(t), 'win probability');
assert.ok(/Predicted winner New York Jets/.test(t));
assert.ok(/Point spread NYJ -2\.2/.test(t));
assert.ok(/Projected total 47/.test(t));
assert.ok(/LAC 15, NYJ 19/.test(t), 'the game played out sits in the details');
assert.ok(/href="\/nfl-simulator\/results\/run\/\?id=31852"/.test(html), 'one click to the full simulation');
assert.ok(!/agrees|disagrees/.test(t), 'no opinion is shown when none was given');

// A bare "disagree": said, with no part of the simulation attributed.
t = text(ctx.fvSimCard(post({ sim: SIM, stance: { position: 'disagree', legacy: true } })));
assert.ok(/nflfun disagrees with this simulation\./.test(t));

// Parts the member picked are named with the simulation's own figure.
t = text(ctx.fvSimCard(post({ sim: SIM, stance: { position: 'disagree', topics: ['winner', 'total'], score: { away: 27, home: 20 } } })));
assert.ok(/nflfun disagrees with the New York Jets winning and the total \(47\)\./.test(t));
assert.ok(/nflfun's score LAC 27, NYJ 20/.test(t));
t = text(ctx.fvSimCard(post({ sim: SIM, stance: { position: 'agree' } })));
assert.ok(/nflfun agrees with this simulation\./.test(t));

// A figure the run did not produce is not drawn (single game, no sample).
const ONE = { run_id: '17571', sport: 'mlb', league: 'MLB', url: '/mlb-simulator/results/run/?id=17571', n_sims: 1,
  away: { abbr: 'PHI', name: 'Philadelphia Phillies' }, home: { abbr: 'ATL', name: 'Atlanta Braves' },
  predicted_winner: 'ATL', simulated_game: { away: 0, home: 3 } };
t = text(ctx.fvSimCard(post({ sim: ONE })));
assert.ok(/0 Simulated final .*3/.test(t) && /Winner Atlanta Braves/.test(t));
assert.ok(!/Win probability|Point spread|Projected total|Predicted winner/.test(t));

// No archived run: a clear fallback, and a link back to the simulator.
html = ctx.fvSimCard(post({ stance: { position: 'disagree' } }));
assert.ok(/not available for this post/.test(html) && /href="\/nfl-simulator\/"/.test(html));
assert.strictEqual(ctx.fvSimCard({ username: 'x', context_source: 'homepage' }), '', 'other posts are untouched');

// Nothing from the payload reaches the page unescaped or links off site.
html = ctx.fvSimCard(post({ sim: Object.assign({}, SIM, { url: '//evil.example/x', away: { abbr: '<b>X', name: '"><script>', logo: 'javascript:1' } }) }));
assert.ok(!/<script>|<b>X|javascript:|evil\.example/.test(html));

// Composer: the stance travels with the post and is reset afterwards.
assert.ok(/body\.stance = stance/.test(take), 'stance is sent with the take');
assert.ok(/stanceUi\.reset\(\)/.test(take));
assert.ok(/STANCE_TOPICS = \[\['winner'/.test(take));
console.log('feed-sim-card-test: ok');
