#!/usr/bin/env node
// NFL_FIRST_PAINT_20261105: the NFL game page held its first paint behind six head scripts.
// They now sit just before the app. Order is what keeps behaviour identical, so order is what
// this holds, along with the only blocking script allowed ahead of the page content.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'nfl-simulator', 'index.html'), 'utf8');
const head = html.slice(0, html.search(/<body\b/i));
const blocking = (head.match(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/gi) || [])
  .filter((t) => !/\b(defer|async)\b/.test(t))
  .map((t) => /src="\/static\/js\/([^"?]+)/.exec(t)[1]);
assert.deepStrictEqual(blocking, ['tmr-analytics.js'], 'blocking head scripts: ' + blocking.join(', '));

const app = html.indexOf("const API='https://trustmyrecord-api.onrender.com/api/nfl/public';");
assert.ok(app > 0, 'app script not found');
const order = ['window.SIM_GATE_FLAGS = {', '/static/js/config.js', '/static/js/backend-api.js',
  '/static/js/roster-clock.js', '/static/js/analytics.js', '/static/js/sim-auth-gate.js'].map((s) => html.indexOf(s));
order.forEach((at, i) => {
  assert.ok(at > 0, 'missing dependency ' + i);
  assert.ok(i === 0 || at > order[i - 1], 'dependency out of order ' + i);
  assert.ok(at < app, 'dependency after the app ' + i);
});
assert.ok(html.indexOf('id="games"') < order[0], 'the setup markup comes before the moved scripts');

// Nothing that runs earlier than these may reach for what they define.
const early = html.slice(html.search(/<body\b/i), order[0]);
const inline = (early.match(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || []).join('');
for (const name of ['window.api', 'window.CONFIG', 'TMRSimGate', 'TMRAnalytics', 'TMRRosterClock']) {
  assert.ok(!inline.includes(name), 'inline script ahead of the move uses ' + name);
}
console.log('nfl-first-paint-test ok');
