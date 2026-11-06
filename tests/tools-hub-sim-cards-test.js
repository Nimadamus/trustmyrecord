'use strict';
// TOOLS_HUB_1106: /tools/ is the only catalog. Every live simulator must have a card in its sport's group,
// the old hub must only redirect, and the free run sentence must be on the hub.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const hub = fs.readFileSync(path.join(root, 'tools', 'index.html'), 'utf8');
const old = fs.readFileSync(path.join(root, 'trustmyrecord-tools', 'index.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error(`FAIL: ${m}`); fail++; };
const groups = hub.split('<h3 class="ts-group">').slice(1);
for (const [sport, pages] of Object.entries({
  MLB: ['mlb-simulator', 'mlb-season-simulator', 'mlb-playoff-simulator', 'mlb-playoff-odds'],
  NFL: ['nfl-simulator', 'nfl-season-simulator', 'nfl-playoff-simulator'],
  NBA: ['nba-simulator', 'nba-season-simulator', 'nba-playoff-simulator'],
  NHL: ['nhl-simulator', 'nhl-season-simulator', 'nhl-playoff-simulator'],
})) {
  const g = groups.find((x) => x.startsWith(sport));
  if (!g) { bad(`no ${sport} group`); continue; }
  for (const p of pages) {
    if (!fs.existsSync(path.join(root, p, 'index.html'))) bad(`${p} page missing`);
    if (!g.includes(`<a class="ts-card" href="/${p}/">`)) bad(`${sport} group has no card for ${p}`);
  }
}
if (!/http-equiv="refresh" content="0; url=\/tools\/"/.test(old)) bad('old hub does not redirect to /tools/');
if (!hub.includes('one run a day on each simulator')) bad('hub has no free run sentence');
if (hub.includes('href="/trustmyrecord-tools/"')) bad('hub still links the old hub');
if (fail) process.exit(1);
console.log('tools hub sim cards: OK');
