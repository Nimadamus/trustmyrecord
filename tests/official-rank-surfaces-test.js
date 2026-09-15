#!/usr/bin/env node
'use strict';
/**
 * OFFICIAL RANK SURFACES (CANONICAL_RANKING_20260914)
 *
 * Every page that shows a handicapper rank prints the OFFICIAL rank the API
 * computed (services/canonicalRanking.js in trustmyrecord-backend), or "NR" /
 * "Not Ranked". No page may number rows by position, re-rank members in the
 * browser, or apply its own qualification rule. scpridematt's "#1 of 1" on a
 * -36u record, Pete_McBurke's #1 NFL on 9 picks, and the directory's CSS
 * counter that restarted under every tier header are what this guards.
 *
 *   node tests/official-rank-surfaces-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { checks += 1; assert.ok(cond, msg); };

function fnSource(src, name) {
  const start = src.search(new RegExp(`function ${name}\\s*\\(`));
  assert.ok(start !== -1, `function ${name} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unterminated ${name}`);
}

// ---- /leaderboards/ -------------------------------------------------------
const lb = read('leaderboards/index.html');
const renderLb = fnSource(lb, 'renderLeaderboard');
ok(renderLb.includes('officialRankCell(entry)'), 'leaderboards: the rank cell is officialRankCell(entry)');
ok(!/'#' \+ \(index \+ 1\)/.test(renderLb), 'leaderboards: the handicapper board must not print the row index as a rank');
ok(/<option value="rank" selected>TMR rank<\/option>/.test(lb), 'leaderboards: TMR rank is the default order');
ok(/<option value="25" selected>25 picks<\/option>/.test(lb), 'leaderboards: 25 graded picks is the default listing floor');
ok(/rank: 'rank'/.test(lb), 'leaderboards: the rank sort maps to the API rank order');
{
  const sandbox = {};
  vm.runInNewContext(`${fnSource(lb, 'escapeHtml')}\n${fnSource(lb, 'officialRankCell')}\nthis.cell = officialRankCell;`, sandbox);
  ok(/>#2<\/span>$/.test(sandbox.cell({ officialRank: 2, rankingStatus: '#2 of 6 qualified' })), 'leaderboards: ranked cell prints #2');
  ok(/top-2/.test(sandbox.cell({ officialRank: 2, rankingStatus: '#2 of 6 qualified' })), 'leaderboards: medal follows the official rank');
  ok(/>NR<\/span>$/.test(sandbox.cell({ officialRank: null, rankingStatus: 'Not Ranked: below break even' })), 'leaderboards: unranked cell prints NR');
  ok(!/top-1/.test(sandbox.cell({ officialRank: null, rankingStatus: 'Not Ranked' })), 'leaderboards: an unranked first row gets no gold medal');
}

// ---- /handicappers/ directory ---------------------------------------------
const hm = read('handicappers/index.html');
ok(!/counter\(hmRank\)|counter-increment:\s*hmRank/.test(hm), 'directory: the # column must not be a CSS row counter');
ok(/content:\s*attr\(data-official-rank\)/.test(hm), 'directory: the # column renders data-official-rank');
ok(!/RANK_SHRINK_THRESHOLD|rankShrinkRamp/.test(hm), 'directory: no browser-side shrink ramp ranking');
ok(/let sortState = \{ field: 'rank', dir: 'asc' \};/.test(hm), 'directory: official rank is the default order');
ok(/return !!officialRankFor\(member\)\.rank;/.test(hm), 'directory: featured leaders are officially ranked members only');
ok(/data-official-rank="' \+ \(official\.rank \? '#' \+ official\.rank : 'NR'\)/.test(hm), 'directory: each row carries its official rank');
ok(/sortBy=rank&minPicks=1&limit=100/.test(hm), 'directory: members load from the canonical board with their rank blocks');
{
  const sandbox = { els: { sport: { value: 'all' } } };
  vm.runInNewContext(`var officialRanksByScope = { all: new Map() };\n${fnSource(hm, 'officialRankMapFrom')}\n${fnSource(hm, 'officialRankScopeKey')}\n${fnSource(hm, 'officialRankFor')}\nthis.api = { officialRankMapFrom, officialRankFor, set: (k, m) => { officialRanksByScope[k] = m; } };`, sandbox);
  const apiRows = [
    { username: 'Alpha', official_rank: 1, ranking_status: '#1 of 3 qualified' },
    { username: 'bravo', official_rank: 2, ranking_status: '#2 of 3 qualified' },
    { username: 'Loser', official_rank: null, ranking_status: 'Not Ranked: below break even' },
  ];
  sandbox.api.set('all', sandbox.api.officialRankMapFrom(apiRows));
  ok(sandbox.api.officialRankFor({ username: 'alpha' }).rank === 1, 'directory: rank lookup is the API rank (case-insensitive)');
  ok(sandbox.api.officialRankFor({ username: 'Loser' }).rank === null, 'directory: a losing record stays NR');
  ok(sandbox.api.officialRankFor({ username: 'not_on_board' }).rank === null, 'directory: a member missing from the board is NR, never numbered');
  sandbox.els.sport.value = 'NFL';
  sandbox.api.set('nfl', sandbox.api.officialRankMapFrom([{ username: 'Alpha', official_rank: null, ranking_status: 'Not Ranked: 3 qualified handicappers required' }]));
  ok(sandbox.api.officialRankFor({ username: 'alpha' }).rank === null, 'directory: a sport filter shows that sport\'s official rank, not the overall one');
}

// ---- profile ---------------------------------------------------------------
const profile = read('profile/index.html');
ok(!/currentLeaderboardRank = idx \+ 1/.test(profile), 'profile: the rank is never the index in a leaderboard list');
ok(/currentLeaderboardRank = Number\(row\.official_rank\)/.test(profile), 'profile: the fallback rank reads official_rank');
ok(/const rankValue = String\(sr\.ranking_status \|\| sr\.status/.test(profile), 'profile: the sport rank card prints the API ranking_status');
ok(!/'Ranked #' \+ sr\.rank/.test(profile), 'profile: no hand-built "Ranked #k of N" from a raw cohort count');

// ---- homepage ---------------------------------------------------------------
const home = read('static/js/tmr-home-live.js');
const lbFn = fnSource(home, 'leaderboard');
ok(/num\(u\.official_rank\) > 0/.test(lbFn), 'home: the leaderboard card lists officially ranked members only');
ok(!/\(i \+ 1\)/.test(lbFn), 'home: the leaderboard card must not print the row index');
ok(!/net_units\) - num\(a\.net_units/.test(lbFn), 'home: the leaderboard card must not re-sort by units');
const compFn = fnSource(home, 'compRowHtml');
ok(!/row\.rank \|\| i \+ 1/.test(compFn), 'home: the competition card must not fall back to the row index');
ok(!/rank \|\| i \+ 1/.test(read('workers/home-ssr/worker.mjs')), 'home SSR worker: no row index fallback');
const indexHtml = read('index.html');
const hashed = (indexHtml.match(/\/static\/js\/tmr-home-live\.([0-9a-f]{12})\.js/) || [])[1];
ok(hashed && fs.existsSync(path.join(root, `static/js/tmr-home-live.${hashed}.js`)), 'home: index.html loads an existing hashed bundle');
ok(read(`static/js/tmr-home-live.${hashed}.js`) === home, 'home: the hashed bundle index.html loads is the current source');
{
  const bakedBoard = indexHtml.match(/<!--MK:homeLeaderboard-->[\s\S]*?<!--\/MK:homeLeaderboard-->/)[0];
  ok(/No official ranks issued yet/.test(bakedBoard) || /class="lbr" title="#\d+ of \d+ qualified"/.test(bakedBoard),
    'home: the baked leaderboard is an official-rank render (or the honest empty state), not a row-index bake');
}

// ---- other widgets ---------------------------------------------------------
const sportLb = read('static/js/tmr-sport-leaderboard.js');
ok(/Number\(u\.official_rank\) > 0 \? '#' \+ Number\(u\.official_rank\) : 'NR'/.test(sportLb), 'sport SEO boards print the official rank or NR');
ok(!/<td>' \+ \(i \+ 1\) \+ '<\/td>/.test(sportLb), 'sport SEO boards do not print the row index');
const sim = read('static/js/mlb-sim-landing.js');
ok(/'<i>#' \+ Number\(u\.official_rank\)/.test(sim) && !/'<i>#' \+ \(i \+ 1\)/.test(sim), 'simulator leader preview prints the official rank');
const feed = read('static/js/feed-ui-overrides.js');
ok(/Number\(u\.official_rank\) > 0/.test(feed), 'feed Top Cappers lists officially ranked members only');
for (const rel of ['sportsbook/index.html', 'sportsbook/v2/index.html']) {
  ok(/if \(sectionId === 'leaderboards'\) \{\s*window\.location\.href = '\/leaderboards\/';\s*return;/.test(read(rel)),
    `${rel}: the in-page localStorage leaderboard is replaced by /leaderboards/`);
}

// ---- prerender bakes --------------------------------------------------------
const bake = read('scripts/prerender_directory.py');
ok(!/#\{idx \+ 1\}/.test(bake), 'prerender: baked leaderboard rows must not print the row index');
ok(/rank_txt = f"#\{rank\}" if rank else "NR"/.test(bake), 'prerender: baked rows print the official rank or NR');
ok(/data-official-rank=/.test(bake), 'prerender: baked directory rows carry the official rank');

console.log(`official-rank-surfaces-test: ok (${checks} checks)`);
