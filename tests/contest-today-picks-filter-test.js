'use strict';
/* CLOUD_AUDIT_20260924: the JustBet leaderboard "Today's Picks" grid merged
   every revealed pick of the whole contest (live: 207 picks over 9 dates)
   because /picks is contest wide. Off-slate picks must now be limited to
   today's Eastern date, while a today pick whose game is missing from the
   slate is still shown.  Run: node tests/contest-today-picks-filter-test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'contests', 'justbet-mlb', 'leaderboard', 'index.html'), 'utf8');
function grab(name) {
  const start = html.indexOf('function ' + name + '(');
  assert(start >= 0, name + ' not found');
  let depth = 0; let i = html.indexOf('{', start);
  for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}') { depth--; if (!depth) break; } }
  return html.slice(start, i + 1);
}
const grid = { innerHTML: '' }; const foot = { innerHTML: '', textContent: '' };
const ctx = {
  $: (sel) => (sel === '#reveal-grid' ? grid : foot),
  escapeHtml: (s) => String(s), teamNick: (s) => String(s), fmtTime: () => '', pickChip: (p) => '[' + p.id + ']',
  serverOffsetMs: 0, Intl, Date, isFinite, Object, String,
};
vm.createContext(ctx);
vm.runInContext(grab('etDay') + '\n' + grab('renderReveal'), ctx);

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const games = [{ id: 'g1', away_team: 'A', home_team: 'B', commence_time: iso(now - 3600e3) }];
const picks = [
  { id: 1, game_id: 'g1', game: 'A @ B', game_start_at: iso(now - 3600e3) },           // on slate
  { id: 2, game_id: 'old', game: 'C @ D', game_start_at: iso(now - 3 * 86400e3) },     // earlier day, off slate
  { id: 3, game_id: 'today_off', game: 'E @ F', game_start_at: iso(now) },            // today, off slate
  { id: 4, game_id: 'nostart', game: 'G @ H', game_start_at: null },                  // unknown start, off slate
];
ctx.renderReveal(games, picks);
assert(grid.innerHTML.includes('[1]'), 'slate pick kept');
assert(grid.innerHTML.includes('[3]'), "today's off-slate pick kept");
assert(!grid.innerHTML.includes('[2]'), 'earlier day pick must not show on Today\'s Picks');
assert(!grid.innerHTML.includes('[4]'), 'off-slate pick with no start date must not show');
console.log('PASS contest Today\'s Picks shows only today\'s picks');

// CLOUD_AUDIT_20260924: member links point at the live profile route, not
// /profile/<name>/ which only exists through the 404 page redirect.
assert(!/href="\/profile\/' \+ encodeURIComponent\(uname\) \+ '\/"/.test(html), 'profile link must not rely on the 404 redirect');
assert(/href="\/profile\/\?user=' \+ encodeURIComponent\(uname\) \+ '"/.test(html));
console.log('PASS contest leaderboard profile links use /profile/?user=');
