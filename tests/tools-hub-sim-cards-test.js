'use strict';
// TOOLS_HUB_SIM_CARDS_20261030: /trustmyrecord-tools/ listed only MLB and NFL although NBA and NHL
// simulators were live. Every live game simulator page must have a card (and a nav link) on the hub.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const hub = fs.readFileSync(path.join(root, 'trustmyrecord-tools', 'index.html'), 'utf8');
const cards = hub.split('<article class="tool-card">').slice(1).map((c) => c.split('</article>')[0]);
const nav = (hub.match(/<nav class="tools-nav"[\s\S]*?<\/nav>/) || [''])[0];
let fail = 0;
for (const sport of ['mlb', 'nfl', 'nba', 'nhl']) {
  const href = `/${sport}-simulator/`;
  if (!fs.existsSync(path.join(root, `${sport}-simulator`, 'index.html'))) continue;
  const card = cards.find((c) => c.includes(`class="tool-btn primary" href="${href}"`));
  if (!card) { console.error(`FAIL: no tool card links ${href}`); fail++; continue; }
  if (!new RegExp(`<h2>${sport.toUpperCase()} Simulator</h2>`).test(card)) { console.error(`FAIL: ${href} card has no "${sport.toUpperCase()} Simulator" heading`); fail++; }
  if (!nav.includes(`href="${href}"`)) { console.error(`FAIL: tools nav has no link to ${href}`); fail++; }
}
if (fail) process.exit(1);
console.log('tools hub sim cards: OK');
