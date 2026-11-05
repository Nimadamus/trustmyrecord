#!/usr/bin/env node
'use strict';
/* BROADCAST_PRESENTATION_20261105. Static, no browser.
   Each check fails on the behaviour it was written against. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SIMUX = require('../scripts/sim-ux.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let n = 0;
const ok = (name, cond) => { assert.ok(cond, name); n += 1; };

/* The core promises neither results view hides anything the other shows, and the
   shell opens on the box view. The box view had no Player ranges, which is what
   crashed tests/nba-nhl-simulator-controls-test.cjs. */
for (const f of ['static/js/nba-simulator-app.js', 'static/js/nhl-simulator-app.js']) {
  const s = read(f);
  const body = s.slice(s.indexOf('function renderBroadcast'));
  const box = body.slice(0, body.indexOf('S.tabs(tabsBox') + 2500);
  for (const label of ['Player ranges', 'Likely scores', 'Win probability']) {
    ok(`${f} box view keeps ${label}`, box.includes(`label: '${label}'`));
  }
}

/* tmr-linkhub.js remounts breadcrumbs every 400 ms when none are visible, so
   hiding them grows the DOM until the tab freezes. */
const css = read('static/css/tmr-sim-broadcast.css');
ok('breadcrumbs are never display:none', !/(simcrumb|Breadcrumb"\])[^{}]*\{[^}]*display:\s*none/.test(css.replace(/:not\([^)]*\)/g, '')));

/* The shell comes from the stamped block, so any rebake keeps it. */
const kinds = {
  'nfl-simulator': 'game', 'mlb-simulator': 'game', 'nba-simulator': 'game', 'nhl-simulator': 'game',
  'sports-simulators': 'hub',
  'nba-season-simulator': 'shell', 'nhl-playoff-simulator': 'shell', 'nfl-season-simulator': 'shell',
  'nfl-playoff-simulator': 'shell', 'mlb-season-simulator': 'shell', 'mlb-playoff-odds': 'shell',
  'nba-simulator/results/run': 'run',
};
for (const [p, kind] of Object.entries(kinds)) {
  const html = fs.readFileSync(path.join(ROOT, p, 'index.html'), 'latin1');
  ok(`${p} is ${kind}`, (SIMUX.bcKind(html) || [])[0] === kind);
  ok(`${p} carries one current block`, (html.match(SIMUX.BC_RE) || []).length === 1
    && html.includes(SIMUX.bcBlock(SIMUX.bcKind(html))));
  ok(`${p} inject is stable`, SIMUX.inject(SIMUX.inject(html)) === SIMUX.inject(html));
}
ok('a matchup page stays outside the shell', SIMUX.bcKind('<link rel="canonical" href="https://trustmyrecord.com/nba-simulator/celtics-vs-knicks/">') === null);

/* Long copy is moved in the browser, never removed from the document. */
const nfl = read('nfl-simulator/index.html');
ok('NFL SEO section still in the HTML', nfl.includes('<section class="seo"') && nfl.includes('application/ld+json'));
const js = read('static/js/tmr-sim-broadcast.js');
ok('the shell never removes page content', !/\.seo[^\n]*\.remove\(\)|innerHTML\s*=\s*''[^\n]*seo/.test(js));
ok('About starts closed', !/bc-about[^\n]*\.open\s*=\s*true/.test(js));
ok('a tap on a slate card never runs', js.includes('stopImmediatePropagation'));

console.log(`PASS  ${n} broadcast presentation checks`);
