const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`Homepage visual regression failed: ${message}`);
    process.exit(1);
  }
}

// 2026-11-02: re-based on the CURRENT homepage. The 20260508 premium dark layer
// this test pinned was replaced by the standalone homepage (d89df0a4, 2026-07-20)
// whose CSS is inlined by scripts/build_home_critical.py and whose navigation is
// rendered by the content-hashed tmr-ds-nav script. The invariants are the same
// ones as before: the visual layer ships inline at first paint, every core route
// stays reachable from the homepage, the core scripts load, and stale sportsbook
// patches never come back.
assert(page.includes('BEGIN HOME CRITICAL CSS'), 'homepage critical CSS (visual layer) is not inlined');
assert(/<html[^>]*data-tmr-build="[0-9a-f]{12}"/.test(page), 'homepage build stamp is missing');

const navMatch = page.match(/src="\/static\/js\/(tmr-ds-nav\.[0-9a-f]{12}\.js)"/);
assert(navMatch, 'content-hashed sitewide nav script include is missing');
const navPath = path.join(root, 'static', 'js', navMatch[1]);
assert(fs.existsSync(navPath), `nav script ${navMatch[1]} referenced by the homepage does not exist`);
const nav = fs.readFileSync(navPath, 'utf8');
const reachable = (route) => page.includes(`href="${route}"`) || nav.includes(route) || page.includes(`urlTemplate": "https://trustmyrecord.com${route}`);

[
  '/sportsbook/',
  '/tools/',
  '/handicappers/',
  '/marketplace/',
  '/feed/',
  '/arena/',
  '/forum/',
  '/polls/',
  '/trivia/',
  '/leaderboards/',
  '/login/',
  '/register/',
  '/contact/',
  '/report-bug/'
].forEach((route) => {
  assert(reachable(route), `route ${route} is no longer reachable from the homepage or its nav`);
  assert(fs.existsSync(path.join(root, route, 'index.html')), `route ${route} has no page in the repo`);
});

[
  'static/js/config.js',
  'static/js/backend-api.js',
  'static/js/auth-persistent.js',
].forEach((script) => {
  assert(page.includes(script), `${script} include is missing`);
});
assert(/gtag\('config', 'G-[A-Z0-9]+'\)/.test(page), 'analytics (gtag config) is missing');

assert(!page.includes('sportsbook-production-fix.js'), 'stale sportsbook patch was introduced on homepage');
assert(!page.includes('tmr-redesign-test-sportsbook-logos.js'), 'obsolete sportsbook logo script was introduced on homepage');

console.log('Homepage visual regression test passed.');
