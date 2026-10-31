#!/usr/bin/env node
'use strict';

/**
 * NFL_SHARE_AFTER_RESULT_20261030: a share control is never offered before
 * there is something of the visitor's own to share.
 *
 *   /nfl-simulator/          share controls exist only inside a rendered result
 *   /nfl-season-simulator/   "Copy link" (picks) disabled until one pick;
 *                            "Share bracket" disabled until one bracket pick
 *   /nfl-playoff-simulator/  "Share bracket" disabled whenever the bracket is empty
 *                            (it ships with the model's projected bracket filled in)
 *
 * The season and playoff pages offered both buttons, enabled, on first load,
 * and pressing them copied a link to the empty projection.
 *
 * Run: NODE_PATH=<checkout>/node_modules node tests/nfl-share-after-result-test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok - ${name}`); } catch (err) {
    console.error(`  FAIL - ${name}\n        ${err && err.message}`); process.exitCode = 1;
  }
}

/** Load a baked page with only the named scripts run (no network). */
function page(rel, scripts) {
  const html = read(rel).replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '');
  const dom = new JSDOM(html, { url: 'https://trustmyrecord.com/' + path.dirname(rel) + '/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  try { w.localStorage.clear(); } catch (e) { /* none */ }
  for (const s of scripts) w.eval(read(s));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}
const visibleShareButtons = (html) => {
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<template\b[\s\S]*?<\/template>/gi, '');
  return (markup.match(/<button\b[^>]*>[^<]*(share|copy (share )?link)[^<]*<\/button>/gi) || []);
};

test('/nfl-simulator/: no share control in the page before a result', () => {
  const html = read('nfl-simulator/index.html');
  assert.deepStrictEqual(visibleShareButtons(html), [], 'a share button is baked into the page');
  // Every share control is created by the result renderers, which run only
  // with a simulate response in hand.
  const src = html.replace(/[\s\S]*?<script>/, '');
  for (const label of ['Copy share link', "'Copy link'", "'Share'"]) {
    const i = src.indexOf(label);
    assert.ok(i > 0, `${label} not found`);
  }
  assert.ok(/function sharePanel\(d,ctx\)/.test(src), 'sharePanel takes the result');
});

test('/nfl-playoff-simulator/: Share bracket needs a bracket (the baked projection or a pick)', () => {
  const w = page('nfl-playoff-simulator/index.html', ['static/js/playoff-bracket.js']);
  const q = () => w.document.querySelector('[data-pb="share"]');
  assert.ok(q(), 'no Share bracket button');
  const cfg = JSON.parse(w.document.querySelector('[data-playoff-bracket] script[type="application/json"]').textContent);
  const baked = Object.keys(cfg.defaultPicks || {}).length;
  assert.strictEqual(q().disabled, baked === 0, `Share bracket disabled=${q().disabled} with ${baked} baked picks`);
  w.document.querySelector('[data-pb="clear"]').click();
  assert.strictEqual(q().disabled, true, 'Share bracket enabled with every pick cleared');
  w.document.querySelector('button.pb-t').click();
  assert.strictEqual(q().disabled, false, 'still disabled after a pick');
});

test('/nfl-season-simulator/: Copy link and Share bracket wait for a pick', () => {
  const w = page('nfl-season-simulator/index.html', ['static/js/nfl-playoff-engine.js', 'static/js/nfl-season-picks.js', 'static/js/playoff-bracket.js']);
  const copy = w.document.querySelector('[data-nsp="share"]');
  assert.ok(copy, 'no Copy link button');
  assert.strictEqual(copy.disabled, true, 'Copy link enabled with no picks');
  const pk = w.document.querySelector('.pick .pk:not([disabled])');
  assert.ok(pk, 'no open game to pick');
  pk.click();
  assert.strictEqual(copy.disabled, false, 'Copy link still disabled after a pick');
  const br = w.document.querySelector('[data-pb="share"]');
  assert.ok(br && br.disabled === true, 'Share bracket enabled with no bracket picks');
});

test('the season builder bakes Copy link disabled (no enabled flash before scripts run)', () => {
  assert.ok(/data-nsp="share" disabled/.test(read('scripts/build_nfl_season_page.js')));
});

console.log(`\nnfl-share-after-result-test: ${passed} passed`);
