'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { html } = require('../static/js/roster-clock.js');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const clockSrc = read('static/js/roster-clock.js');
const mlb = read('static/js/mlb-simulator.js');
const nba = read('static/js/nba-simulator-app.js');
const nhl = read('static/js/nhl-simulator-app.js');
const nfl = read('nfl-simulator/index.html');

const check = html('mlb', {
  built_at: '2026-10-27T12:07:12.293Z',
  roster_changed_at: '2026-10-23T18:07:08.706Z',
  clock: 'last_successful_roster_check',
  freshness: 'current',
  data_age_hours: 4.8,
  refresh_status: 'ok',
  source: 'statsapi',
});
assert.ok(check.includes('Last successful roster check:'), check);
assert.ok(check.includes('Last roster change:'), check);
assert.ok(check.includes('Probable pitchers stay labelled probable'), check);

const fallback = html('nba', { built_at: '2026-10-27T13:31:50.238Z', freshness: 'current', data_age_hours: 1.8 });
assert.ok(fallback.includes('Last roster snapshot:'), fallback);
assert.ok(fallback.includes('no separate last change time'), fallback);
assert.ok(fallback.includes('Starting lineups stay labelled projected'), fallback);
assert.ok(!fallback.includes('Last roster change:'), fallback);

const goalie = html('nhl', { built_at: '2026-10-27T13:33:13.504Z', freshness: 'current' });
assert.ok(goalie.includes('Starting goalies stay labelled projected'), goalie);

const missing = html('nfl', null);
assert.ok(missing.includes('will not invent a timestamp'), missing);

const feeds = html('nfl', {
  built_at: '2026-10-27T10:33:26.310Z',
  freshness: 'current',
  data_age_hours: 6.4,
  feeds: [
    { feed: 'nfl_inactives', last_success_at: '2026-10-27T16:38:19.992Z', is_stale: false },
    { feed: 'nfl_injuries_espn', last_success_at: '2026-10-27T16:38:16.640Z', is_stale: false },
    { feed: 'not_a_feed', last_success_at: '2026-10-27T16:38:16.640Z', is_stale: false },
  ],
});
assert.ok(feeds.includes('Inactives:'), feeds);
assert.ok(feeds.includes('ESPN injuries:'), feeds);
assert.ok(!feeds.includes('not_a_feed'), feeds);
assert.ok(feeds.includes('Skill player usage stays labelled projected'), feeds);

assert.ok(/overflow-wrap:anywhere/.test(clockSrc));
assert.ok(/max-width:100%/.test(clockSrc));
assert.ok(/@media \(max-width:480px\)/.test(clockSrc));
assert.ok(!/white-space:nowrap/.test(clockSrc));

for (const sport of ['mlb', 'nba', 'nhl', 'nfl']) {
  const page = read(sport + '-simulator/index.html');
  assert.ok(page.includes('data-roster-clock="' + sport + '"'), sport + ' page missing clock');
  assert.ok(page.includes('/static/js/roster-clock.js'), sport + ' page missing script');
}

assert.ok(/Today's MLB probable starter, not a confirmed starter/.test(mlb));
assert.ok(!/confirmed MLB probable/.test(mlb));
assert.ok(/Injury list did not load/.test(mlb));
assert.ok(/statusBadge\('projected'/.test(nba));
assert.ok(/No feed publishes a confirmed minutes restriction/.test(nba));
assert.ok(/Projected starter/.test(nhl));
assert.ok(/statusBadge\('projected'/.test(nhl));
assert.ok(/No inactives were ingested for this game/.test(nfl));
assert.ok(/run dated/.test(nfl));
assert.ok(!/roster data as of \$\{/.test(nfl));

console.log('roster-clock-label-test: ok');
