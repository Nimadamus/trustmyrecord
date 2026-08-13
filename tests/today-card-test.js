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

/* --------------------------------- 2b. mixed state from per-question locks */

// Each quiz question now closes at its own game's first pitch, so a quiz is
// routinely part open and part shut. A single open/closed label would be wrong
// either way: "open" invites answers the backend rejects, "closed" hides
// questions that are still playable.

check('part-open quiz reports open, with the count still answerable', () => {
  const res = L.pollState({
    questions_open: 6, questions_open_unanswered: 6, total_questions: 10, user_answered: false
  }, AFTERNOON_ET);
  assert.strictEqual(res.state, 'open');
  assert.strictEqual(res.open, 6);
  assert.strictEqual(res.total, 10);
});

check('every question shut reports closed, not open', () => {
  const res = L.pollState({
    questions_open: 0, questions_open_unanswered: 0, total_questions: 10, user_answered: false
  }, AFTERNOON_ET);
  assert.strictEqual(res.state, 'closed');
});

check('every question shut, but they played, reports completed', () => {
  const res = L.pollState({
    questions_open: 0, questions_open_unanswered: 0, total_questions: 10, user_answered: true
  }, AFTERNOON_ET);
  assert.strictEqual(res.state, 'completed');
});

check('answered everything still open reports completed, not open', () => {
  const res = L.pollState({
    questions_open: 4, questions_open_unanswered: 0, total_questions: 10, user_answered: true
  }, AFTERNOON_ET);
  assert.strictEqual(res.state, 'completed', 'would nag a member who has answered everything available');
});

check('per-question state wins over the parent deadline', () => {
  // Parent deadline long past, but questions are still open: trust the questions,
  // because that is what the vote endpoint enforces.
  const res = L.pollState({
    questions_open: 3, questions_open_unanswered: 3, total_questions: 10,
    user_answered: false, closes_at: '2026-08-09T10:00:00Z', status: 'active'
  }, Date.parse('2026-08-09T20:00:00Z'));
  assert.strictEqual(res.state, 'open');
});

check('a pre-fix quiz with no per-question field uses the old logic unchanged', () => {
  const legacy = { status: 'active', user_answered: false, closes_at: '2026-08-09T22:00:00Z', question_count: 10 };
  assert.strictEqual(L.pollState(legacy, Date.parse('2026-08-09T18:00:00Z')).state, 'open');
  assert.strictEqual(L.pollState(legacy, Date.parse('2026-08-09T23:00:00Z')).state, 'closed');
});

check('the card renders the mixed count rather than a bare "open"', () => {
  const js = read('static/js/today-card.js');
  assert.ok(/res\.open \+ ' of ' \+ res\.total \+ ' questions still open'/.test(js),
    'the mixed state is computed but never shown to the member');
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

/* ----------------------------- 3b. the board is the game source now */

// /api/nav/mlb-slate stopped answering (no response inside 45s, three attempts,
// 2026-08-13), which is exactly why the teams module rendered "Following 3
// teams" and nothing else. The board endpoint replaces it. These helpers are
// what turn its payload into a matchup, a time and a price.

const BOARD = [
  { away_team: 'Tennessee Titans', home_team: 'San Francisco 49ers',
    commence_time: '2026-08-14T01:00:00.000Z',   // 9:00pm ET on 08-13
    market_groups: [{ items: [
      { market_type: 'h2h', selection: 'San Francisco 49ers', odds_display: '-150' },
      { market_type: 'h2h', selection: 'Tennessee Titans', odds_display: '+130' }] }] },
  { away_team: 'Colorado Rockies', home_team: 'San Francisco Giants',
    commence_time: '2026-08-15T02:15:00.000Z' },  // 10:15pm ET on 08-14
];
const BOARD_NOW = Date.parse('2026-08-13T18:00:00Z');  // 2:00pm ET on 08-13

check('a game late tonight is still TODAY in Eastern, not tomorrow', () => {
  // 01:00 UTC on the 14th is 9pm ET on the 13th. A UTC-day filter would drop
  // every night game from the board, which is most of them.
  assert.strictEqual(L.gamesOnDay(BOARD, L.etDay(BOARD_NOW)).length, 1);
  assert.strictEqual(L.gamesOnDay(BOARD, L.etDay(BOARD_NOW))[0].home_team, 'San Francisco 49ers');
});

check("today's game wins over a later one", () => {
  const f = L.teamGame(BOARD, 'San Francisco 49ers', BOARD_NOW);
  assert.ok(f && f.isToday, 'a game today must be reported as today');
});

check('a team not playing today gets its NEXT game, flagged as not today', () => {
  const f = L.teamGame(BOARD, 'San Francisco Giants', BOARD_NOW);
  assert.ok(f && !f.isToday);
  assert.strictEqual(f.game.away_team, 'Colorado Rockies');
});

check('a finished game is never shown as what is next', () => {
  const after = Date.parse('2026-08-16T18:00:00Z');
  assert.strictEqual(L.teamGame(BOARD, 'San Francisco Giants', after), null);
});

check('an unknown clock never invents a "next" game', () => {
  assert.strictEqual(L.teamGame(BOARD, 'San Francisco Giants', null), null);
});

check('moneylines are read, never computed', () => {
  assert.strictEqual(L.moneyline(BOARD[0], 'San Francisco 49ers'), '-150');
  assert.strictEqual(L.moneyline(BOARD[0], 'Tennessee Titans'), '+130');
  assert.strictEqual(L.moneyline(BOARD[1], 'San Francisco Giants'), null,
    'a game with no posted price must report none, not a guess');
});

check('only leagues with upcoming games are requested', () => {
  const health = { games: {
    baseball_mlb: { upcoming: 103 }, americanfootball_nfl: { upcoming: 320 },
    basketball_nba: { upcoming: 0 }, icehockey_nhl: { upcoming: 0 } } };
  assert.deepStrictEqual(L.activeLeagues(health).sort(), ['mlb', 'nfl']);
  assert.deepStrictEqual(L.activeLeagues(null), [], 'no health payload must not fan out four requests');
});

check('club nicknames are right, not "York Yankees"', () => {
  const cases = {
    'New York Yankees': 'Yankees', 'Green Bay Packers': 'Packers',
    'Golden State Warriors': 'Warriors', 'Los Angeles Dodgers': 'Dodgers',
    'Boston Red Sox': 'Red Sox', 'Chicago White Sox': 'White Sox',
    'Toronto Blue Jays': 'Blue Jays', 'Portland Trail Blazers': 'Trail Blazers',
    'Vegas Golden Knights': 'Golden Knights', 'San Francisco 49ers': '49ers',
    'Athletics': 'Athletics', '': '',
  };
  Object.keys(cases).forEach((k) => assert.strictEqual(L.shortTeamName(k), cases[k], k));
});

check('the shared logo table can name a team\'s league', () => {
  const logo = read('static/js/tmr-team-logo.js');
  assert.ok(/function league\(name\)/.test(logo), 'TMRTeamLogo.league is missing');
  assert.ok(/leagueUrl: leagueUrl, league: league/.test(logo), 'league is not exported');
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

/* ---------------------------------------------- 5. the dashboard layout */

// REDESIGN_20260813. This was four identical 100px rows in a 640px column on a
// 1720px canvas, which is why it read as an admin screen. The checks below are
// the shape of the fix, not decoration: if a future edit collapses the grid back
// to one column of equal boxes, or re-narrows the page, these fail.

check('the signed-out panel can never render behind a signed-in dashboard', () => {
  // Every one of these blocks is display:flex/grid AND ships `hidden`.
  assert.ok(/\[hidden\]\{display:none !important\}/.test(html),
    'a display declaration beats the [hidden] UA rule');
});

check('six modules, each with a heading - this is a dashboard', () => {
  const mods = html.match(/class="td-card(?: td-[a-z-]+)*"/g) || [];
  assert.strictEqual(mods.length, 6, 'expected six dashboard modules');
  ['tdModPoll', 'tdModTrivia', 'tdModTeams', 'tdModStand', 'tdModBoard', 'tdModCommunity']
    .forEach((id) => assert.ok(html.includes('id="' + id + '"'), 'missing module ' + id));
  assert.strictEqual((html.match(/<h2 id="td/g) || []).length, 6, 'every module needs its own h2');
});

check('modules are NOT all the same size', () => {
  // The quiz is the only full-bleed surface in the primary band; teams and the
  // board share that band's two columns; the rail is narrower than all of them.
  assert.strictEqual((html.match(/td-card td-wide/g) || []).length, 1,
    'exactly one hero-sized module - otherwise the hierarchy is flat again');
  assert.ok(/\.td-wide\{grid-column:span 2\}/.test(html), 'the hero module must span the primary band');
  assert.ok(/<div class="td-col">/.test(html) && /<div class="td-rail">/.test(html),
    'the primary band and the rail must be separate columns, or a tall rail card leaves a hole');
});

check('the page uses the design system container, not a private narrow column', () => {
  assert.ok(/<div class="ds-wrap">/.test(html), 'the page must use .ds-wrap');
  assert.ok(!/\.td-wrap\{max-width:\d+px/.test(html), 'a private max-width column is back');
});

check('the grid is multi-column on desktop and single-column on mobile', () => {
  assert.ok(/\.td-grid\{[^}]*grid-template-columns:minmax\(0,1fr\) \d+px/.test(html),
    'desktop must be a primary band plus a rail');
  assert.ok(/\.td-col\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(html),
    'the primary band must be two columns on a wide screen - three columns overall');
  assert.ok(/@media\(max-width:1080px\)\{[\s\S]*?\.td-grid\{grid-template-columns:minmax\(0,1fr\)\}/.test(html),
    'narrow viewports must collapse to one column');
});

check('the title clears the sticky navbar', () => {
  assert.ok(/\.td-hero\{[\s\S]*?scroll-margin-top:calc\(var\(--nav-h\)/.test(html),
    'an in-page anchor would land the hero under the sticky nav');
  assert.ok(/\.td-hero\{[\s\S]*?margin:\d+px 0/.test(html), 'the hero must reserve space below the nav');
});

check('the page stopped carrying its own private accent colour', () => {
  // The prose above the stylesheet names the retired colour on purpose, so
  // only the declarations are searched.
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/#00aeff/i.test(css), 'the retired page-private blue is back; use the brand token');
});

check('tap targets meet the 44px minimum and every module reserves height', () => {
  assert.ok(/\.td-cta\{[^}]*min-height:44px/.test(html), 'CTAs must keep the 44px tap minimum');
  ['\\.td-qlist', '\\.td-teams-grid', '\\.td-games', '\\.td-lb', '\\.td-pulse'].forEach((sel) => {
    assert.ok(new RegExp(sel + '\\{[^}]*min-height:\\d+px').test(html),
      sel + ' does not reserve height - its buttons would jump under a thumb');
  });
  assert.ok(/\.td-foot-note\{[^}]*min-height:/.test(html));
});

check('team marks come from the shared logo helper, not a second copy', () => {
  assert.ok(html.includes('/static/js/tmr-team-logo.js'), 'the shared logo helper is not loaded');
  const js = read('static/js/today-card.js');
  assert.ok(/TL\.html\(name, \{ className: cls \}\)/.test(js), 'logos are not going through TMRTeamLogo');
  assert.ok(!/a\.espncdn\.com/.test(js), 'a second hardcoded logo CDN path has appeared in the page code');
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
