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

assert(page.includes('HOMEPAGE_PREMIUM_DARK_UI_20260508'), 'premium dark homepage marker is missing');
assert(page.includes('<style id="tmr-home-premium-dark-ui-20260508">'), 'homepage visual layer style block is missing');
assert(page.includes('linear-gradient(135deg, #67e8f9 0%, #2dd4bf 64%, #35dc80 100%)'), 'primary action gradient changed');
assert(page.includes('background: rgba(6, 13, 25, 0.92) !important;'), 'dark homepage header override is missing');
assert(page.includes('radial-gradient(circle at 12% 0%, rgba(45, 212, 191, 0.12), transparent 30%)'), 'dark page background changed');

[
  '/sportsbook/',
  '/trustmyrecord-tools/',
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
  assert(page.includes(`href="${route}"`) || page.includes(`urlTemplate": "https://trustmyrecord.com${route}`), `route ${route} is no longer present`);
});

[
  'static/js/config.js',
  'static/js/backend-api.js',
  'static/js/auth-persistent.js',
  'static/js/tmr-sitewide.js',
  'static/js/analytics.js'
].forEach((script) => {
  assert(page.includes(script), `${script} include is missing`);
});

assert(!page.includes('sportsbook-production-fix.js'), 'stale sportsbook patch was introduced on homepage');
assert(!page.includes('tmr-redesign-test-sportsbook-logos.js'), 'obsolete sportsbook logo script was introduced on homepage');

console.log('Homepage visual regression test passed.');
