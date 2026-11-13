/* SIM_PAGE_FRESHNESS_ALERT_20261113: one notice per incident. Replays the 40 hour dead bake of
   11/12 to 11/13 hour by hour and counts what the monitor would have sent. No network. */
const assert = require('assert');
const A = require('../scripts/sim-page-freshness-alert.js');
const F = require('../scripts/check-sim-page-freshness.js');
let n = 0; const ok = (name, c, extra) => { assert.ok(c, name + (extra ? ': ' + extra : '')); n += 1; };

const P = (pages, age) => ({ checked_at: 'Nov 13, 8:40 AM PT', problems: pages.map((p) => ({ page: p, problem: `built ${age} h ago (limit 6 h)`, age_h: age })) });
const six = F.STAMPED;

ok('fresh and no alert: nothing', A.decide({ problems: [] }, '').action === 'none');
const first = A.decide(P(six, 7), '');
ok('first stale check opens one issue', first.action === 'open' && /6 pages/.test(first.title));
ok('issue body lists every page and carries the fingerprint', six.every((p) => first.body.includes('/' + p + '/')) && A.FP_RE.test(first.body));

/* replay: 40 hourly checks with the same six pages stale, ages growing */
let body = first.body, sent = 1;
for (let h = 8; h < 47; h += 1) { const d = A.decide(P(six, h), body); if (d.action !== 'none') sent += 1; if (d.body) body = d.body; }
ok('40 hours of the same problem: one notice in total', sent === 1, String(sent));

/* the game pages join (the slate date rolls past) */
const joined = A.decide(P(six.concat(['nba-simulator', 'nhl-simulator']), 30), body);
ok('a page joining is one comment naming it', joined.action === 'comment' && /Now also stale: \/nba-simulator\/, \/nhl-simulator\//.test(joined.comment));
body = joined.body;
ok('same wider set again: nothing', A.decide(P(six.concat(['nhl-simulator', 'nba-simulator']), 31), body).action === 'none');

const partial = A.decide(P(['nfl-season-simulator'], 9), body);
ok('partial recovery is one comment naming what came back', partial.action === 'comment' && /Fresh again:/.test(partial.comment) && /nba-season-simulator/.test(partial.comment));
const closed = A.decide({ checked_at: 'x', problems: [] }, partial.body);
ok('all fresh closes the issue with one comment', closed.action === 'close' && /fresh again/.test(closed.comment));
ok('fresh with nothing open stays silent', A.decide({ problems: [] }, '').action === 'none');
ok('an issue edited by hand (no fingerprint) gets one comment, then quiet', (() => { const d = A.decide(P(six, 7), 'someone rewrote this'); return d.action === 'comment' && A.decide(P(six, 8), d.body).action === 'none'; })());
ok('fingerprint ignores order and duplicates', A.fingerprint([{ page: 'b' }, { page: 'a' }, { page: 'b' }]) === 'a,b');
console.log(`sim-page-freshness-alert-test: ${n} passed`);
