'use strict';
/* CLOUD_AUDIT_20260924: the main board's week/month filters are rolling
   windows (routes/users.js SCOPED_PERIODS week: 7, month: 30 ->
   p.locked_at >= NOW() - INTERVAL 'N days'), but were labeled "This week" and
   "This month", which read as calendar periods. The poll and trivia selects on
   the same page already say "Last 7 days" / "Last 30 days".
   Run: node tests/leaderboard-period-labels-test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'leaderboards', 'index.html'), 'utf8');
const sel = html.slice(html.indexOf('<select id="boardFilter">'), html.indexOf('</select>', html.indexOf('<select id="boardFilter">')));
assert(/<option value="week">Last 7 days<\/option>/.test(sel));
assert(/<option value="month">Last 30 days<\/option>/.test(sel));
assert(/<option value="rookie-month">New members, last 30 days<\/option>/.test(sel));
console.log('PASS leaderboard rolling window labels');
