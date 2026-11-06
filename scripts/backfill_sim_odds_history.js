#!/usr/bin/env node
'use strict';
/* SIM_TEAM_DETAIL_20261105. One off, read only against git: seeds data/sim-odds-history.json
   from the odds tables the bakes already published, the last bake of each Pacific day. Run from
   a checkout with history (the bake's shallow clone has none, and does not need this).
     node scripts/backfill_sim_odds_history.js <days> <teams.json> */
const fs = require('fs');
const { execFileSync } = require('child_process');
const TD = require('./sim-team-detail.js');

const days = Number(process.argv[2]) || 3;
const names = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));   // {sport: {name: id}}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const num = (s) => (/^&lt;1|^<1/.test(s) ? 0 : /^&gt;99|^>99/.test(s) ? 100 : parseInt(s, 10));
const strip = (s) => s.replace(/<[^>]*>/g, '').trim();

function rows(html, sport) {
  const out = [];
  const start = sport === 'nfl' ? html.indexOf('id="lsimTables"') : html.indexOf('id="lsimOdds"');
  const end = sport === 'nfl' ? html.indexOf('</section>', start) : html.indexOf('</table>', start);
  const re = /<tr><th scope="row">([\s\S]*?)<\/th>([\s\S]*?)<\/tr>/g;
  const seg = html.slice(start, end);
  let m;
  while ((m = re.exec(seg))) {
    const name = (/class="ln">([^<]+)/.exec(m[1]) || [])[1];
    const cells = (m[2].match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(strip);
    if (!name || !names[sport][name]) continue;
    /* NFL: wins, range, division, playoffs, 1 seed. NBA, NHL: playoffs ... title. */
    out.push(sport === 'nfl' ? [names[sport][name], num(cells[3]), null] : [names[sport][name], num(cells[0]), num(cells[4])]);
  }
  return out;
}

const history = fs.existsSync(TD.FILE) ? JSON.parse(fs.readFileSync(TD.FILE, 'utf8')) : {};
const log = [];
for (const [sport, page] of [['nba', 'nba-playoff-simulator'], ['nhl', 'nhl-playoff-simulator'], ['nfl', 'nfl-season-simulator']]) {
  const seen = new Set();
  const commits = git('log', '--since=' + (days + 1) + ' days ago', '--format=%H %cI', 'origin/main', '--', page + '/index.html').trim().split('\n');
  for (const line of commits) {                       // newest first: first per day is the last bake
    const [sha, when] = line.split(' ');
    const day = TD.dayOf(when);
    if (seen.has(day)) continue;
    const list = rows(git('show', sha + ':' + page + '/index.html'), sport);
    if (list.length < 30) continue;
    seen.add(day);
    history[sport] = history[sport] || {};
    if (history[sport][day]) continue;
    history[sport][day] = {};
    list.forEach(([id, po, ti]) => { history[sport][day][id] = [po, ti]; });
    log.push(`${sport} ${day} ${sha.slice(0, 12)} ${list.length} teams`);
  }
}
fs.writeFileSync(TD.FILE, JSON.stringify(history) + '\n');
console.log(log.join('\n'));
