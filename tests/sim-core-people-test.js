#!/usr/bin/env node
'use strict';

/**
 * sim-core-people-test.js -- the photo, label and record helpers the NBA and
 * NHL simulators share (static/js/tmr-sim-core.js). No browser: the file is run
 * in a sandbox with just enough of a window to load it.
 *
 *   node tests/sim-core-people-test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'tmr-sim-core.js'), 'utf8');
const win = { document: undefined, navigator: {}, location: { href: '' } };
win.window = win;
vm.runInNewContext(src, { window: win, Date, Math, JSON, String, Number, isFinite, parseInt, parseFloat, Object, Array, RegExp, URLSearchParams });
const S = win.TMRSim;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; process.stdout.write('  ok   ' + name + '\n'); };

check('NBA photo comes from ESPN, small, by id', () => {
  assert.strictEqual(S.headshotUrl('nba', { id: '4066261' }),
    'https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/4066261.png&w=96&h=70');
});

check('NHL photo comes from the league CDN, by season folder, club and id', () => {
  const u = S.headshotUrl('nhl', { id: '8478403' }, 'VGK');
  assert(/^https:\/\/assets\.nhle\.com\/mugs\/nhl\/\d{8}\/VGK\/8478403\.png$/.test(u), u);
});

check('a URL from the feed wins; a player with no usable id gets none', () => {
  assert.strictEqual(S.headshotUrl('nhl', { id: '1', headshot: 'https://x/y.png' }, 'VGK'), 'https://x/y.png');
  assert.strictEqual(S.headshotUrl('nba', { id: 'abc' }), null);
  assert.strictEqual(S.headshotUrl('nhl', { id: '8478403' }, null), null);
  assert.strictEqual(S.headshotUrl('nba', null), null);
});

check('initials fall back cleanly', () => {
  assert.strictEqual(S.initials('Jack Eichel'), 'JE');
  assert.strictEqual(S.initials('Nikola Jokic'), 'NJ');
  assert.strictEqual(S.initials('Zion'), 'Z');
  assert.strictEqual(S.initials(''), '');
});

check('records carry the season they belong to', () => {
  assert.strictEqual(S.recordText({ record: { wins: 1, losses: 1, otLosses: 0, season: '2026-27' } }), '1-1-0 (2026-27)');
  assert.strictEqual(S.recordText({ record: { wins: 43, losses: 39, season: 2026 } }), '43-39 (2025-26)');
  assert.strictEqual(S.recordText({ record: { wins: 42, losses: 33, otLosses: 6 } }), '42-33-6');
  assert.strictEqual(S.recordText({ record: null }), '');
});

check('data age reads in hours or days', () => {
  assert.strictEqual(S.ageText(new Date(Date.now() - 20 * 60000).toISOString()), 'updated within the hour');
  assert.strictEqual(S.ageText(new Date(Date.now() - 5 * 3600000).toISOString()), 'updated 5 hours ago');
  assert.strictEqual(S.ageText(new Date(Date.now() - 72 * 3600000).toISOString()), 'updated 3 days ago');
  assert.strictEqual(S.ageText(null), null);
});

process.stdout.write('PASS ' + passed + ' passed\n');
