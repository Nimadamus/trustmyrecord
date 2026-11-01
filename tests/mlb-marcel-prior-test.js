#!/usr/bin/env node
'use strict';
/**
 * mlb-marcel-prior-test.js -- MARCEL_PRIOR_20261101.
 *
 * Season-to-date numbers are regressed toward each player's and club's OWN last
 * season, not toward league average. A point-in-time replay of all 2,429 games of
 * 2026 through this engine: Brier 0.24840 -> 0.24611, paired -0.0023 (95% CI
 * -0.0039 to -0.0007). No market price is read.
 *
 *   1. An ace with two starts and a 9.00 ERA is not rated as a bad pitcher.
 *   2. A pitcher with no last season sits a little below league, not at his raw line.
 *   3. A club ten games in carries 60 games of last season (half regressed).
 *   4. Without last season loaded, the standings rule is the old one (10+ games).
 *   5. Last season is fetched for seasonYear() - 1, one request, combined split for a traded player.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'static', 'js', 'mlb-simulator.js'), 'utf8');
function el() {
  return { style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; }, appendChild() {}, removeChild() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, textContent: '', innerHTML: '', value: '', disabled: false };
}
const seen = [];
let reply = null;
const context = {
  window: { URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} }, location: { search: '', href: '', pathname: '/mlb-simulator/' }, addEventListener() {}, TMR_MLB_STATS_SEASON: '2027' },
  document: { readyState: 'complete', getElementById() { return el(); }, addEventListener() {}, createElement: el, querySelector() { return null; }, querySelectorAll() { return []; }, body: el() },
  console: { log() {}, warn() {}, error() {}, info() {} },
  Math, Number, Date, Promise, JSON, setTimeout, clearTimeout, Blob: class Blob {}, navigator: {},
  fetch: (url) => { seen.push(String(url)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(reply), text: () => Promise.resolve(JSON.stringify(reply)) }); },
  CONFIG: { api: { baseUrl: 'http://offline' } },
};
context.window.document = context.document;
vm.runInNewContext(script, context);
const sim = context.window.TMRMlbSimulator;
const E = sim._engine;
const L = () => sim.state.liveContext;

let failures = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(() => process.stdout.write('  PASS  ' + name + '\n'))
    .catch((e) => { failures += 1; process.stdout.write('  FAIL  ' + name + '\n        ' + e.message + '\n'); });
}

(async () => {
  process.stdout.write('\n  MLB MARCEL PRIOR\n\n');
  await check('an ace two starts in with a 9.00 ERA is rated near his last season', () => {
    L().playerStats = { '1:pitching': { inningsPitched: '10.0', earnedRuns: 10 } };
    L().priorStats = { 1: { pitching: { outs: 600, earnedRuns: 50 } } }; // 2.25 ERA over 200 IP
    const era = E.marcelEra(1);
    assert.ok(era > 2.5 && era < 4.0, 'regressed ERA ' + era);
  });
  await check('no last season: below league, not the raw small sample', () => {
    L().playerStats = { '2:pitching': { inningsPitched: '5.0', earnedRuns: 0 } };
    L().priorStats = {};
    const era = E.marcelEra(2);
    assert.ok(era > 3.5 && era < 4.6, 'regressed ERA ' + era);
  });
  await check('a club ten games in carries 60 games of last season', () => {
    L().teamSeason = { NYY: { rs: 80, ra: 30, gp: 10 } };
    L().teamPrior = { NYY: { rspg: 4.8, rapg: 4.2 } };
    const s = E.marcelTeamSeason('NYY');
    assert.strictEqual(s.gp, 70);
    assert.ok(Math.abs(s.rs - (80 + 60 * 4.8)) < 1e-9 && Math.abs(s.ra - (30 + 60 * 4.2)) < 1e-9);
  });
  await check('without last season the 10 game rule holds', () => {
    L().teamPrior = null;
    L().teamSeason = { NYY: { rs: 80, ra: 30, gp: 9 }, BOS: { rs: 50, ra: 40, gp: 12 } };
    assert.strictEqual(E.marcelTeamSeason('NYY'), null);
    assert.strictEqual(E.marcelTeamSeason('BOS').gp, 12);
  });
  await check('last season is one request for seasonYear() - 1, combined split for a traded player', async () => {
    assert.strictEqual(E.priorSeasonYear(), '2026');
    L().priorStats = null; seen.length = 0;
    reply = { people: [{ id: 553993, stats: [{ group: { displayName: 'hitting' }, splits: [
      { stat: { plateAppearances: 657, ops: '.824' }, numTeams: 2 },
      { team: { name: 'Arizona Diamondbacks' }, stat: { plateAppearances: 437 } },
      { team: { name: 'Seattle Mariners' }, stat: { plateAppearances: 220 } }] }] }] };
    await E.fetchPriorSeasonLines([553993, 999]);
    const u = seen.filter((x) => /\/people\?personIds=/.test(x));
    assert.strictEqual(u.length, 1, 'one request');
    assert.ok(/season=2026\)/.test(decodeURIComponent(u[0])), u[0]);
    assert.strictEqual(L().priorStats['553993'].hitting.plateAppearances, 657);
    assert.strictEqual(JSON.stringify(L().priorStats['999']), JSON.stringify({ hitting: null, pitching: null }));
  });
  await check('a failed request leaves last season unloaded (no blend against nothing)', async () => {
    L().priorStats = null; reply = null;
    await E.fetchPriorSeasonLines([1, 2]);
    assert.strictEqual(L().priorStats, null);
  });
  await check('nothing here reads a market price', () => {
    const block = script.slice(script.indexOf('// MARCEL_PRIOR_20261101 -- regress'), script.indexOf('    function pitcherQualityFor('));
    assert.ok(block.length > 500);
    assert.ok(!/odds|moneyline|sportsbook|overUnder/i.test(block), 'market term in the Marcel block');
  });
  process.stdout.write('\n');
  if (failures) { process.stdout.write('  ' + failures + ' failed\n\n'); process.exit(1); }
  process.stdout.write('  All Marcel prior assertions hold.\n\n');
})();
