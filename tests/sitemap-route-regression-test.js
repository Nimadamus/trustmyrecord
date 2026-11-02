const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`Sitemap route regression failed: ${message}`);
    process.exit(1);
  }
}

[
  'https://trustmyrecord.com/',
  'https://trustmyrecord.com/sportsbook/',
  'https://trustmyrecord.com/handicappers/',
  'https://trustmyrecord.com/leaderboards/',
  'https://trustmyrecord.com/feed/',
  'https://trustmyrecord.com/arena/',
  'https://trustmyrecord.com/marketplace/',
  'https://trustmyrecord.com/forum/',
  'https://trustmyrecord.com/hangout/',
  'https://trustmyrecord.com/polls/',
  'https://trustmyrecord.com/trivia/',
  // 2026-11-02: login/register left the sitemap on purpose in 88783e56 (SEO
  // Batch 1A, non-indexable utility pages) and the per-user profile-market.html
  // drilldown in 1651424c (route hygiene). The test follows those SEO decisions;
  // the sitemap itself is not changed here.
  'https://trustmyrecord.com/privacy/',
  'https://trustmyrecord.com/terms/'
].forEach((url) => {
  assert(sitemap.includes(`<loc>${url}</loc>`), `missing canonical sitemap URL: ${url}`);
});

[
  'https://trustmyrecord.com/polls-trivia/',
  // /predictions/ is no longer a shim: it is the MLB Run Prediction Model page
  // (own canonical, indexable), so it is allowed in the sitemap.
  'https://trustmyrecord.com/forums/',
  'https://trustmyrecord.com/leaderboard/',
  'https://trustmyrecord.com/cappers/',
  'https://trustmyrecord.com/members/',
  'https://trustmyrecord.com/directory/',
  'https://trustmyrecord.com/account/',
  'https://trustmyrecord.com/dashboard/',
  'https://trustmyrecord.com/signin/',
  'https://trustmyrecord.com/signup/',
  'https://trustmyrecord.com/submit/',
  'https://trustmyrecord.com/submit-pick/',
  'https://trustmyrecord.com/pick/',
  'https://trustmyrecord.com/make-picks/'
].forEach((url) => {
  assert(!sitemap.includes(`<loc>${url}</loc>`), `legacy shim URL should not be advertised: ${url}`);
});

assert(!sitemap.includes('hangout.html'), 'sitemap must not advertise .html hangout routes');
assert(!sitemap.includes('sportsbook-production-fix'), 'sitemap must not reference sportsbook patch assets');

console.log('sitemap route regression test passed');
