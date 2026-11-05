'use strict';
/* TEAM_HEADER_ACTUALS_20261105: a team page header prints this season's real figures, never the
   blended model inputs. Source check on the builder (the pages themselves need live data, and
   program_1105/evidence/nba-nhl has the 62 page comparison). Fails on the old builder, whose
   standfirst read s.ppg and s.goalsFor. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build_sim_team_pages.js'), 'utf8');
const stand = [...src.matchAll(/standfirst:[\s\S]*?\n\s+body,/g)].map((m) => m[0]);
assert.strictEqual(stand.length, 2, 'one header per sport');
assert.ok(/headline/.test(stand[0]) && !/s\.ppg/.test(stand[0]), 'NBA header reads the real line');
assert.ok(/real\.goalsFor/.test(stand[1]) && !/\bs\.goalsFor/.test(stand[1]), 'NHL header reads the real line');
assert.ok(/'Model profile'/.test(src) && /'Model inputs'/.test(src), 'blended tables are labelled');
assert.ok(!/labelled projected, not confirmed/.test(src), 'starter copy names confirmed starters');
console.log('TEAM_HEADER_ACTUALS PASSED');
