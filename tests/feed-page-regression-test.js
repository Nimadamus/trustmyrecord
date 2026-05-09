const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'feed', 'index.html'), 'utf8');
const override = fs.readFileSync(path.join(root, 'static', 'js', 'feed-ui-overrides.js'), 'utf8');
const social = fs.readFileSync(path.join(root, 'static', 'js', 'social-home.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`Feed regression failed: ${message}`);
    process.exit(1);
  }
}

assert(html.includes('FEED_REAL_ACTIVITY_STARTUP_20260509'), 'startup no-seed marker is missing');
assert(html.includes('id="feedList"'), 'feed list mount is missing');
assert(html.includes('id="feedStartupState"'), 'startup state is missing');
assert(html.includes('Loading real feed activity'), 'startup state copy is missing');
assert(html.includes('Pending picks stay hidden'), 'pending privacy hero copy is missing');
assert((html + override + social).includes('Pick details hidden until eligible for public record.'), 'pending pick privacy copy is missing');

[
  '/static/js/backend-api.js',
  '/static/js/auth-persistent.js',
  '/static/js/social-home.js',
  '/static/js/feed-ui-overrides.js',
  '/static/js/tmr-sitewide.js'
].forEach((script) => {
  assert(html.includes(script), `${script} include is missing`);
});

[
  '/sportsbook/',
  '/feed/',
  '/leaderboards/',
  '/arena/',
  '/forum/',
  '/marketplace/',
  '/profile/',
  '/polls/',
  '/trivia/'
].forEach((route) => {
  const source = html + override + social;
  assert(source.includes(`href="${route}"`) || source.includes(`href='${route}'`), `route ${route} is missing`);
});

assert(!html.includes('data-id="betlegend-graded-2026-05-03"'), 'hard-coded BetLegend feed item was reintroduced');
assert(!html.includes('4-2, +6.20u') && !html.includes('4-2 - <span'), 'hard-coded record stats were reintroduced');
assert(!html.includes('6 picks graded'), 'hard-coded graded-pick count was reintroduced');
assert(!html.includes('No fake users or synthetic records are shown.') || html.includes('Real production users will appear here'), 'no-fake copy changed unexpectedly');

assert(override.includes('TMR_GENERATED_USER_RE'), 'generated/test user filter is missing');
assert(override.includes('test|demo|mock|seed|sample|fixture|dummy|placeholder|synthetic|fake'), 'generated-user filter must cover fake/demo/seed/sample tokens');
assert(override.includes("!['pending', 'locked'].includes(String(p.status || '').toLowerCase())"), 'feed override must filter pending/locked public discovery picks');
assert((override.match(/!\['pending', 'locked'\]\.includes\(String\(p\.status \|\| ''\)\.toLowerCase\(\)\)/g) || []).length >= 3, 'feed override must filter pending/locked picks in feed, trending, and arena discovery paths');
assert((override.match(/\.filter\(isRealPublicFeedUser\)/g) || []).length >= 5, 'feed override must apply generated-user filtering to feed, picks, polls, trending, and rail modules');
assert(override.includes("api.request('/feed?limit=' + FEED_LIMIT"), 'feed override must request backend feed activity');
assert(override.includes("api.request('/polls/active?limit=5')"), 'feed override must request real active polls');
assert(override.includes('TrustMyRecord does not substitute fake feed posts'), 'feed override must keep no-fake backend-unavailable copy');
assert(override.includes('Public graded picks will surface here as real records update. Pending pick details stay private.'), 'feed trending empty state must keep pending privacy copy');
assert(social.includes('TrustMyRecord does not substitute fake feed posts'), 'base feed script must keep no-fake fallback copy');

console.log('Feed page regression test passed.');
