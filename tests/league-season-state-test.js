'use strict';
/**
 * league-season-state-test.js -- season timing copy on the NBA and NHL season
 * and playoff pages comes from the schedule, never from typed-in dates.
 *
 *   node tests/league-season-state-test.js
 */
const assert = require('assert');
const { seasonState, seasonStateLine } = require('../scripts/build_league_sim_pages.js');

const g = (date, final) => ({ date, final });
const sched = [g('2026-09-29T23:00Z', false), g('2026-10-01T23:00Z', false), g('2027-04-10T23:00Z', false)];
const at = (iso) => Date.parse(iso);

assert.strictEqual(seasonState([], at('2026-08-01T00:00Z')).phase, 'unpublished');
assert.ok(/schedule is not published/.test(seasonStateLine('2026-27', [], at('2026-08-01T00:00Z'))));

assert.strictEqual(seasonState(sched, at('2026-09-01T00:00Z')).phase, 'preseason');
assert.ok(/regular season opens/.test(seasonStateLine('2026-27', sched, at('2026-09-01T00:00Z'))));

// The bug this exists for: a week into the season the page still said "opens".
const started = [g('2026-09-29T23:00Z', true), g('2026-10-01T23:00Z', false), g('2027-04-10T23:00Z', false)];
const line = seasonStateLine('2026-27', started, at('2026-10-06T00:00Z'));
assert.strictEqual(seasonState(started, at('2026-10-06T00:00Z')).phase, 'regular');
assert.ok(!/opens/.test(line), line);
assert.ok(/underway, with 1 of 3 games played/.test(line), line);

// Opening night, first puck not yet final but already past: still "underway", not "opens".
assert.strictEqual(seasonState(sched, at('2026-09-30T03:00Z')).phase, 'regular');

const done = sched.map((x) => g(x.date, true));
assert.strictEqual(seasonState(done, at('2027-05-01T00:00Z')).phase, 'complete');
assert.ok(/regular season is complete/.test(seasonStateLine('2026-27', done, at('2027-05-01T00:00Z'))));

process.stdout.write('LEAGUE_SEASON_STATE PASSED\n');
