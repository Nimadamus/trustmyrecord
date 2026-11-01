'use strict';
/**
 * LEAGUE_SIM_CLS_20261101: every baked league / MLB odds page reserves the shared
 * header's height before tmr-ds-nav.js lands. /mlb-playoff-odds/ and the 30 MLB
 * team odds pages had no reservation (built by build_mlb_odds_page.js, not the
 * league builder) and measured CLS 0.108 at 390 px, 0.054 at 1366 (live, 4x CPU,
 * slow 4G, 11/01 12:15 AM PDT). Fails on the builder before this change.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pages = ['mlb-playoff-odds/index.html', 'nba-playoff-odds/index.html', 'nhl-playoff-odds/index.html'];
const teamDir = path.join(root, 'mlb-simulator', 'teams');
if (fs.existsSync(teamDir)) for (const d of fs.readdirSync(teamDir)) {
  const f = path.join('mlb-simulator', 'teams', d, 'index.html');
  if (fs.existsSync(path.join(root, f)) && /lsim-wrap/.test(fs.readFileSync(path.join(root, f), 'utf8'))) pages.push(f);
}
let checked = 0;
for (const rel of pages) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (!/tmr-ds-nav[.\w]*\.js/.test(html)) continue;
  checked += 1;
  const body = html.indexOf('<body');
  const reserve = html.indexOf('id="dsNavReserve"');
  const main = html.indexOf('<main', body);
  assert.ok(reserve > body && reserve < main, `${rel}: header height not reserved before <main>`);
}
assert.ok(checked >= 31, `only ${checked} pages checked`);
console.log(`league-sim-nav-reserve-test: ok (${checked} pages)`);
