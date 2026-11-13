/* SEASON_FIRST_PAINT_20261113: what a visitor sees before any script runs must agree with
   the entry window the builder was told about. On 11/13/2026 the static page said
   "2026 Season, Entries closed" beside "2027 entries are open" and hid the buttons. */
const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const B = require('../scripts/build_mlb_season_pages.js');
const SS = require('../scripts/mlb_season_state.js');
const state = SS.readState(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'mlb-season-simulator', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'static', 'js', 'season-simulator.js'), 'utf8');
const noScript = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '');
const w = new JSDOM(noScript).window;
const shown = (id) => { const n = w.document.getElementById(id); return !!n && w.getComputedStyle(n).display !== 'none'; };
const kick = w.document.querySelector('.ss-kicker').textContent.replace(/\s+/g, ' ').trim();
let n = 0; const ok = (name, cond) => { assert.ok(cond, name); n += 1; };
if (SS.isComplete(state) && B.ENTRIES_OPEN_SEASON) {
  ok('kicker names the open season', kick === `${B.ENTRIES_OPEN_SEASON} Season · Entries open`);
  ok('static page never says Entries closed', !/Entries closed/.test(noScript));
  ok('Save Draft and Submit & Lock visible before any script', shown('ss-actions'));
  /* the log in prompt starts hidden by its own rule and the script shows it to signed out
     visitors; the season block must simply not force it shut */
  const rule = (html.match(/<!--MK:mlbSeasonState--><style>([^<]*)<\/style>/) || [])[1] || '';
  for (const id of B.ENTRY_CONTROLS) ok(id + ' is outside the baked hide rule', rule.includes(`:not(#${id})`) && !/!important/.test((w.document.getElementById(id).getAttribute('style') || '')));
  ok('script writes the same kicker words for an open window', js.includes("' Season &middot; Entries open'"));
  ok('rebuild is idempotent', B.kicker(B.applyPhaseCopy(B.apply(html, state, 'x', 'mlb-season-simulator'), state), state, 'mlb-season-simulator') === html);
} else if (SS.isComplete(state)) {
  ok('closed: kicker says closed', /Entries closed/.test(kick));
  for (const id of B.ENTRY_CONTROLS) ok(id + ' hidden while closed', !shown(id));
}
/* the other MLB pages keep the plain hide rule */
ok('other pages hide every in-season control', B.block(state, 'mlb-simulator').includes('[data-mlb-season-only]{display:none!important}') || !SS.isComplete(state));
console.log(`mlb-season-first-paint-test: ${n} passed`);
