const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
// static/js/api.js (the old local TrustMyRecordAPI) was deleted in d9870aad
// (2026-08-06). A deleted local API cannot seed anything, so its assertions run
// only if the file ever comes back; and no page may load it again.
const apiPath = path.join(root, 'static', 'js', 'api.js');
const apiExists = fs.existsSync(apiPath);
const api = apiExists ? fs.readFileSync(apiPath, 'utf8') : null;
if (!apiExists) {
  for (const page of ['index.html', 'profile/index.html', 'forum/index.html', 'feed/index.html', 'sportsbook/index.html', 'u/index.html']) {
    const file = path.join(root, page);
    if (fs.existsSync(file) && /["']\/?static\/js\/api\.js/.test(fs.readFileSync(file, 'utf8'))) {
      console.error(`Local API no-seed regression failed: ${page} loads the deleted static/js/api.js`);
      process.exit(1);
    }
  }
}
const socialFeed = fs.readFileSync(path.join(root, 'static', 'js', 'social-feed.js'), 'utf8');
const social = fs.readFileSync(path.join(root, 'static', 'js', 'social.js'), 'utf8');
const socialSystem = fs.readFileSync(path.join(root, 'static', 'js', 'social-system.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`Local API no-seed regression failed: ${message}`);
    process.exit(1);
  }
}

if (apiExists) assert(api.includes('// No demo data - all data comes from real user activity'), 'no-demo-data comment must remain');
if (apiExists) assert(api.includes('// No seeded data. Everything starts at zero.'), 'zero-startup comment must remain');
if (apiExists) assert(api.includes('// No seeded threads or posts - all data comes from real user activity'), 'no seeded forum data comment must remain');
if (apiExists) assert(api.includes('const sampleThreads = [];'), 'local forum fallback threads must start empty');
if (apiExists) assert(api.includes('const samplePosts = [];'), 'local forum fallback posts must start empty');
if (apiExists) assert(api.includes("this.setLocal('tmr_threads', sampleThreads);"), 'empty local thread fallback must remain wired');
if (apiExists) assert(api.includes("this.setLocal('tmr_posts', samplePosts);"), 'empty local post fallback must remain wired');

[
  'BetLegend',
  'SharpSide',
  'demoUser',
  'fakeUser',
  'seededThread',
  'demoLeaderboard',
  'fakeLeaderboard'
].forEach((token) => {
  if (apiExists) assert(!api.includes(token), `fake/demo local API token must not be reintroduced: ${token}`);
});

if (apiExists) assert(/const\s+sampleThreads\s*=\s*\[\s*\];/.test(api), 'sampleThreads must remain an empty array');
if (apiExists) assert(/const\s+samplePosts\s*=\s*\[\s*\];/.test(api), 'samplePosts must remain an empty array');

[
  'pruneSeedData()',
  "post.id.indexOf('seed_') === 0",
  "like.targetId.indexOf('seed_') === 0",
  "comment.id.indexOf('scmt_') === 0",
  "comment.postId.indexOf('seed_') === 0",
  "String(like.userId || '').toLowerCase() !== 'user_demo'",
  "String(comment.userId || '').toLowerCase() !== 'user_demo'",
  'this.save(this.POSTS_KEY, this.posts)',
  'this.save(this.LIKES_KEY, this.likes)',
  'this.save(this.COMMENTS_KEY, this.comments)'
].forEach((token) => {
  assert(socialFeed.includes(token), `social feed seed cleanup token missing: ${token}`);
});

[
  'seed_post',
  'seed_user',
  'demo_user',
  'fake_user',
  'sample_posts',
  'starterPosts',
  'defaultPosts = ['
].forEach((token) => {
  assert(!socialFeed.includes(token), `social feed must not reintroduce seeded local content token: ${token}`);
});

[
  [
    social,
    'social.js loadAllPicks cleanup',
    'loadAllPicks()',
    'local picks must never appear as if they',
    'social surfaces to use the backend feed only'
  ],
  [
    socialSystem,
    'social-system.js getFollowingPicks cleanup',
    'getFollowingPicks(username, limit = 20)',
    'local picks must never feed the following',
    'Real following picks come from the backend /feed endpoint'
  ]
].forEach(([source, label, functionToken, privacyToken, backendToken]) => {
  assert(source.includes(functionToken), `${label} function token missing`);
  assert(source.includes(privacyToken), `${label} privacy comment missing`);
  assert(source.includes(backendToken), `${label} backend-only comment missing`);
  assert(source.includes("['tmr_picks', 'trustmyrecord_picks', 'tmr_picks_legacy']"), `${label} must list legacy local pick storage keys`);
  assert(source.includes('localStorage.removeItem(key)'), `${label} must clear legacy local pick storage keys`);
  assert(/return\s+\[\s*\];/.test(source), `${label} must return an empty array instead of local picks`);
});

console.log('local API no-seed regression test passed');
