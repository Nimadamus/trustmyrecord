/* SIM_PAGE_FRESHNESS_20261113: the checker must flag the pages exactly as they were served
   during the 40 hour dead bake, and pass a fresh bake. No network. */
const assert = require('assert');
const F = require('../scripts/check-sim-page-freshness.js');
let n = 0; const ok = (name, c, extra) => { assert.ok(c, name + (extra ? ': ' + extra : '')); n += 1; };
const season = (stamp) => `<p>136 of 272 games final, read ${stamp} PT.</p>`;
const game = (lg, day) => `<h2>Next ${lg} games: ${day}</h2>`;
const build = (stamp, day) => { const p = {}; F.STAMPED.forEach((k) => { p[k] = season(stamp); }); p['nba-simulator'] = game('NBA', day); p['nhl-simulator'] = game('NHL', day); return p; };
const fri = new Date('2026-11-13T16:40:00Z'); /* Fri Nov 13, 8:40 AM PST */

ok('PST stamp parses', F.readStamp(season('November 11, 2026 at 5:00 PM')).toISOString() === '2026-11-12T01:00:00.000Z');
ok('PDT stamp parses', F.readStamp(season('July 4, 2026 at 12:05 AM')).toISOString() === '2026-07-04T07:05:00.000Z');
ok('noon parses', F.readStamp(season('November 13, 2026 at 12:30 PM')).toISOString() === '2026-11-13T20:30:00.000Z');

const dead = F.evaluate(build('November 11, 2026 at 5:00 PM', 'Wednesday, November 11, 2026'), fri, 6);
ok('dead bake of 11/13: all 8 pages flagged', dead.length === 8);
ok('dead bake: age is about 40 h', dead[0].age_h > 39 && dead[0].age_h < 40);
ok('fresh bake passes', F.evaluate(build('November 13, 2026 at 8:09 AM', 'Friday, November 13, 2026'), fri, 6).length === 0);
ok('slate later in the week is fine', F.evaluate(build('November 13, 2026 at 8:09 AM', 'Sunday, November 15, 2026'), fri, 6).length === 0);
ok('late evening PT still counts as today', F.evaluate(build('November 13, 2026 at 9:00 PM', 'Friday, November 13, 2026'), new Date('2026-11-14T07:30:00Z'), 6).length === 0);
const off = build('November 13, 2026 at 8:09 AM', 'Friday, November 13, 2026'); off['nba-simulator'] = '<p>No games scheduled.</p>';
ok('no slate block (off season) is not an alarm', F.evaluate(off, fri, 6).length === 0);
const gone = build('November 13, 2026 at 8:09 AM', 'Friday, November 13, 2026'); gone['nfl-season-simulator'] = null; gone['nhl-playoff-simulator'] = '<p>nothing</p>';
ok('an unanswered page and a page without a stamp are problems', F.evaluate(gone, fri, 6).length === 2);
/* HUB_FRESHNESS_20261113: the Handicapping hubs */
const hub = (stamp) => `<span class="hx-eyebrow">Updated ${stamp} ET</span>`;
ok('hub stamp parses (EST)', F.hubStamp(hub('Nov 13, 2026, 7:15 PM')).toISOString() === '2026-11-14T00:15:00.000Z');
ok('hub stamp parses (EDT)', F.hubStamp(hub('Jul 4, 2026, 9:05 AM')).toISOString() === '2026-07-04T13:05:00.000Z');
const withHubs = (stamp) => { const p = build('November 13, 2026 at 8:09 AM', 'Friday, November 13, 2026'); F.HUBS.forEach((h) => { p[h] = hub(stamp); }); return p; };
/* Friday 2:40 PM PT, the hubs still on Thursday 6:50 PM ET: the state found on 11/13 */
const friPm = new Date('2026-11-13T22:40:00Z');
const stale = F.evaluate(withHubs('Nov 12, 2026, 6:50 PM'), friPm, 24);
ok('the 11/13 hub outage is flagged on both hubs', stale.length === 2 && stale.every((x) => /hub last rebuilt 2[0-9]\.\d h ago/.test(x.problem)), JSON.stringify(stale));
ok('a hub rebuilt this morning is fresh', F.evaluate(withHubs('Nov 13, 2026, 1:45 PM'), friPm, 24).length === 0);
const overnight = build('November 14, 2026 at 1:30 AM', 'Saturday, November 14, 2026'); F.HUBS.forEach((h) => { overnight[h] = hub('Nov 13, 2026, 5:45 PM'); });
ok('the normal overnight gap (12 h) is not an alarm', F.evaluate(overnight, new Date('2026-11-14T10:30:00Z'), 6).length === 0);
const noStamp = withHubs('x'); noStamp['handicapping/nfl'] = '<p>hub</p>'; noStamp['handicapping/nhl'] = null;
ok('a hub with no stamp, or one that does not answer, is a problem', F.evaluate(noStamp, friPm, 24).length === 2);
ok('callers that do not fetch the hubs are not judged on them', F.evaluate(build('November 13, 2026 at 8:09 AM', 'Friday, November 13, 2026'), fri, 6).length === 0);
console.log(`sim-page-freshness-test: ${n} passed`);
