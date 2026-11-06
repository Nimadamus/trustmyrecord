#!/usr/bin/env node
/**
 * SIM_NEXT_STEP_20261105. NFL, NBA and NHL season and playoff pages each carry
 * one Lock a pick and one Pro path, and nothing more. The Pro link is the one
 * the game page meter uses; /premium/ only maps known `from` values. No Watchdog
 * name in this block.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PRO = '/premium/?from=sim_meter&amp;src=sim_meter#pricing';

const { nextStepPanel } = require('../scripts/build_league_sim_pages.js');
['NFL', 'NBA', 'NHL'].forEach((label) => {
    const html = nextStepPanel(label);
    assert.strictEqual((html.match(/<a /g) || []).length, 2, 'two links only');
    assert.ok(html.includes('href="/sportsbook/?sport=' + label + '"'), 'opens that sport on the board');
    assert.ok(html.includes('href="' + PRO + '"'));
    assert.ok(!/watchdog/i.test(html));
    assert.ok(!/free and unlimited/i.test(html));
    assert.ok(!/[–—]/.test(html), 'no dashes in published copy');
});

const gate = read('static/js/sim-auth-gate.js');
assert.ok(gate.includes(PRO.replace(/&amp;/g, '&')), 'same link as the game page meter');
assert.ok(/Unlimited runs on every simulator/.test(gate), 'same wording as the game page meter');
assert.ok(/sim_meter:\s*'sim_meter'/.test(read('premium/index.html')), '/premium/ knows this source');

const league = read('scripts/build_league_sim_pages.js');
assert.strictEqual((league.match(/\$\{nextStepPanel\(sportName\)\}/g) || []).length, 2, 'season and playoff templates');
assert.strictEqual((read('scripts/build_nfl_season_page.js').match(/H\.nextStepPanel\('NFL'\)/g) || []).length, 1);

const playoff = read('nfl-playoff-simulator/index.html');
assert.strictEqual(playoff.split('href="/sportsbook/?sport=NFL"').length - 1, 1);
assert.strictEqual(playoff.split('href="' + PRO + '"').length - 1, 1);

console.log('sim-season-next-step-test: ok');

// One spelling per table: the playoff odds table prints small odds the way the season table does.
const UI = require('../static/js/league-season-sim.js');
assert.strictEqual(UI.pct(0.001), '&lt;1%');
const oddsRow = league.split('\n').find((l) => l.includes('const row = (slot, a) =>'));
assert.ok(oddsRow.includes('UI.pct(proj[a].playoffs)') && oddsRow.includes('UI.pct(proj[a].champion)'));
assert.ok(!oddsRow.includes('pctText('), 'prose wording stays out of the table');
console.log('sim-season-next-step-test: table wording ok');
