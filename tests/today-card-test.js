/**
 * /today/ daily card - static + pure-logic regression gate.
 *
 * Three things here are load-bearing and would fail silently:
 *
 *  1. THE DAY BOUNDARY. "Played today" must flip at midnight Eastern for every
 *     member at the same instant, from the SERVER's clock. A browser clock that
 *     is hours off, or a member in Tokyo, must not change the answer. These are
 *     pure functions precisely so this can be proven without a browser.
 *
 *  2. A CLOSED QUIZ MUST NOT LOOK PLAYABLE. Today's quiz closes around first
 *     pitch, so a member opening the site in the evening will find it shut.
 *     Painting a Play button on it sends them into a rejection. Fixing the
 *     timing is a separate release; lying about it is never acceptable.
 *
 *  3. THE PUBLIC NAV MUST NOT CHANGE. The Today link is authenticated-only, so
 *     the crawlable link graph a search engine sees is byte-identical to
 *     before this release.
 *
 * No network, no browser, no database.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const L = require('../static/js/today-card.js');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { failures++; console.error('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('\ntoday card gate');

/* ------------------------------------------------- 1. the ET day boundary */

// 2026-08-09 23:30 ET is 2026-08-10 03:30 UTC (EDT = UTC-4).
const LATE_NIGHT_ET = Date.parse('2026-08-10T03:30:00Z');
// 2026-08-10 00:30 ET is 2026-08-10 04:30 UTC - the NEXT ET day.
const AFTER_MIDNIGHT_ET = Date.parse('2026-08-10T04:30:00Z');
// Mid-afternoon ET, unambiguous in every zone.
const AFTERNOON_ET = Date.parse('2026-08-09T18:00:00Z');

check('an instant maps to its Eastern calendar day', () => {
  assert.strictEqual(L.etDay(AFTERNOON_ET), '2026-08-09');
  assert.strictEqual(L.etDay(LATE_NIGHT_ET), '2026-08-09', '11:30pm ET is still the same ET day');
  assert.strictEqual(L.etDay(AFTER_MIDNIGHT_ET), '2026-08-10', '12:30am ET is the next ET day');
});

check('the boundary is Eastern, not UTC', () => {
  // Both instants fall on 2026-08-10 in UTC; only one is 08-10 in ET.
  assert.notStrictEqual(L.etDay(LATE_NIGHT_ET), L.etDay(AFTER_MIDNIGHT_ET),
    '11:30pm and 12:30am ET must be different days');
});

check('same-day comparison spans the UTC rollover correctly', () => {
  assert.ok(L.sameEtDay(AFTERNOON_ET, LATE_NIGHT_ET), 'afternoon and late night are one ET day');
  assert.ok(!L.sameEtDay(LATE_NIGHT_ET, AFTER_MIDNIGHT_ET), 'ET midnight must split the day');
});

check('an unknown instant is never treated as "today"', () => {
  assert.strictEqual(L.etDay(null), null);
  assert.strictEqual(L.etDay(NaN), null);
  assert.ok(!L.sameEtDay(null, AFTERNOON_ET));
  assert.ok(!L.sameEtDay(AFTERNOON_ET, undefined));
});

check('trivia played last night still counts as played today at 11:30pm ET', () => {
  const stats = { attempts: 5, last_played_at: new Date(AFTERNOON_ET).toISOString() };
  assert.strictEqual(L.triviaState(stats, LATE_NIGHT_ET).state, 'completed');
});

check('trivia resets after Eastern midnight', () => {
  const stats = { attempts: 5, last_played_at: new Date(LATE_NIGHT_ET).toISOString() };
  const res = L.triviaState(stats, AFTER_MIDNIGHT_ET);
  assert.strictEqual(res.state, 'open', 'a new ET day must reset the daily state');
  assert.strictEqual(res.everPlayed, true, 'but their history is still known');
});

check('without server time, trivia never claims "played today"', () => {
  const stats = { attempts: 5, last_played_at: new Date(AFTERNOON_ET).toISOString() };
  assert.strictEqual(L.triviaState(stats, null).state, 'open',
    'an unknown clock must not produce a completion claim');
});

/* ------------------------------------------ 2. a closed quiz is not playable */

const OPEN_POLL = { id: 1, status: 'active', user_answered: false, closes_at: '2026-08-09T22:00:00Z', question_count: 10 };

check('an open quiz is open', () => {
  assert.strictEqual(L.pollState(OPEN_POLL, Date.parse('2026-08-09T18:00:00Z')).state, 'open');
});

check('a quiz past its close time is CLOSED, never open', () => {
  assert.strictEqual(L.pollState(OPEN_POLL, Date.parse('2026-08-09T23:00:00Z')).state, 'closed');
});

check('close time is inclusive - exactly at the deadline is closed', () => {
  assert.strictEqual(L.pollState(OPEN_POLL, Date.parse('2026-08-09T22:00:00Z')).state, 'closed');
});

check('a non-active status is closed whatever the clock says', () => {
  const p = Object.assign({}, OPEN_POLL, { status: 'resolved' });
  assert.strictEqual(L.pollState(p, Date.parse('2026-08-09T18:00:00Z')).state, 'closed');
});

check('an answered quiz reports completed, not open', () => {
  const p = Object.assign({}, OPEN_POLL, { user_answered: true });
  assert.strictEqual(L.pollState(p, Date.parse('2026-08-09T18:00:00Z')).state, 'completed');
});

check('no quiz posted is unavailable, not closed and not open', () => {
  assert.strictEqual(L.pollState(null, AFTERNOON_ET).state, 'unavailable');
});

check('unknown server time never yields "open" on a quiz with a deadline', () => {
  assert.strictEqual(L.pollState(OPEN_POLL, null).state, 'unknown_time');
});

check('the closed and completed branches offer no play CTA in the page code', () => {
  const js = read('static/js/today-card.js');
  const closed = js.slice(js.indexOf("res.state === 'closed'"), js.indexOf("res.state === 'unknown_time'"));
  assert.ok(/is-muted|See the standings/.test(closed), 'closed branch must not present a play action');
  assert.ok(!/Answer today/.test(closed), 'closed branch offers an answer CTA');
});

/* ------------------------------------------------------ 3. team module CTA */

check('a member with no teams gets a real call to action', () => {
  assert.strictEqual(L.teamState([], { games: [] }).state, 'no_teams');
  assert.strictEqual(L.teamState(null, null).state, 'no_teams');
});

check('a member with teams and a game today sees the game', () => {
  const slate = { games: [{ away_team_name: 'Toronto Blue Jays', home_team_name: 'Philadelphia Phillies', away: 'TOR', home: 'PHI' }] };
  const res = L.teamState(['Philadelphia Phillies'], slate);
  assert.strictEqual(res.state, 'games');
  assert.strictEqual(res.games.length, 1);
});

check('a member with teams and no game today is told so, not shown an empty card', () => {
  const slate = { games: [{ away_team_name: 'Toronto Blue Jays', home_team_name: 'Philadelphia Phillies' }] };
  assert.strictEqual(L.teamState(['Miami Dolphins'], slate).state, 'no_games_today');
});

check('a failed slate does not erase the fact that they have teams', () => {
  assert.strictEqual(L.teamState(['Miami Dolphins'], null).state, 'unavailable');
});

/* ------------------------------------------------- 4. nav / SEO invariants */

const nav = read('static/js/tmr-ds-nav.js');

check('the Today nav link is gated on an existing session', () => {
  const fn = nav.slice(nav.indexOf('function todayLink()'), nav.indexOf('function menu('));
  assert.ok(/if \(!hasTokens\(\)\) return '';/.test(fn),
    'the Today link is not gated on hasTokens() - it would enter the public nav');
});

check('the public nav is otherwise untouched', () => {
  ['/sportsbook/', '/handicappers/', '/community/', '/tools/'].forEach((href) => {
    assert.ok(nav.includes("'" + href + "'"), 'lost an existing nav route: ' + href);
  });
});

const html = read('today/index.html');

check('page is self-canonical with no noindex', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://trustmyrecord.com/today/">'));
  assert.ok(!/noindex/i.test(html));
});

check('/today/ is deliberately absent from the sitemap', () => {
  assert.ok(!read('sitemap.xml').includes('/today/'),
    '/today/ was added to the sitemap - this release must not change indexing surface');
});

check('every module has a real href before JavaScript runs', () => {
  ['href="/polls/"', 'href="/trivia/"', 'href="/profile/"', 'href="/sportsbook/"'].forEach((h) => {
    assert.ok(html.includes(h), 'missing pre-rendered target ' + h);
  });
});

check('exactly four modules - this is a card, not a dashboard', () => {
  assert.strictEqual((html.match(/class="td-row"/g) || []).length, 4);
});

check('tap targets meet the 44px minimum and rows reserve height', () => {
  assert.ok(/\.td-cta\{[^}]*min-height:44px/.test(html));
  assert.ok(/\.td-row\{[^}]*min-height:\d+px/.test(html));
  assert.ok(/\.td-status\{[^}]*min-height:/.test(html));
});

check('the page writes nothing', () => {
  assert.ok(!/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(read('static/js/today-card.js')),
    'the daily card issues a write request');
});

check('the browser clock is never used for a day decision', () => {
  const js = read('static/js/today-card.js');
  // Strip comments first: the file explains this rule in prose, and a naive
  // scan flags its own documentation.
  const code = js
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/Date\.now\(\)/.test(code), 'Date.now() would trust the browser clock');
  assert.ok(!/new Date\(\)/.test(code), 'new Date() with no argument would trust the browser clock');
  // The HTTP Date header is NOT usable: it is not CORS-safelisted, and the API
  // is a different origin, so headers.get('date') is null in the browser
  // (confirmed against production - only cache-control, content-type, expires
  // and pragma are exposed). The clock therefore comes from a response body.
  assert.ok(/\/api\/health/.test(code), 'no server-clock source is being read');
  assert.ok(/h\.timestamp/.test(code), 'the server timestamp is not being taken from the body');
  assert.ok(!/headers\.get\(['"]date['"]\)/.test(code),
    'still reading the HTTP Date header, which is always null cross-origin');
});

check('the day-sensitive modules wait for the server clock', () => {
  const js = read('static/js/today-card.js');
  const start = js.slice(js.indexOf('function start()'));
  assert.ok(/clock\.then\(loadPoll\)/.test(start), 'the quiz module does not wait for server time');
  assert.ok(/clock\.then\(loadTrivia\)/.test(start), 'the trivia module does not wait for server time');
});

check('the sitewide nav Today link is authenticated-only', () => {
  const sw = read('static/js/tmr-sitewide.js');
  assert.ok(/hasAuthTokens\(\)\s*\?\s*`<a class="tmr-global-nav__today"/.test(sw),
    'the sitewide Today link is not gated on an existing session');
});

if (failures) { console.error('\n' + failures + ' failing check(s)\n'); process.exit(1); }
console.log('\nall today card checks passed\n');
