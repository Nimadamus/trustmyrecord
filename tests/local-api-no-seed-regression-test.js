const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'static', 'js', 'api.js'), 'utf8');
const socialFeed = fs.readFileSync(path.join(root, 'static', 'js', 'social-feed.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`Local API no-seed regression failed: ${message}`);
    process.exit(1);
  }
}

assert(api.includes('// No demo data - all data comes from real user activity'), 'no-demo-data comment must remain');
assert(api.includes('// No seeded data. Everything starts at zero.'), 'zero-startup comment must remain');
assert(api.includes('// No seeded threads or posts - all data comes from real user activity'), 'no seeded forum data comment must remain');
assert(api.includes('const sampleThreads = [];'), 'local forum fallback threads must start empty');
assert(api.includes('const samplePosts = [];'), 'local forum fallback posts must start empty');
assert(api.includes("this.setLocal('tmr_threads', sampleThreads);"), 'empty local thread fallback must remain wired');
assert(api.includes("this.setLocal('tmr_posts', samplePosts);"), 'empty local post fallback must remain wired');

[
  'BetLegend',
  'SharpSide',
  'demoUser',
  'fakeUser',
  'seededThread',
  'demoLeaderboard',
  'fakeLeaderboard'
].forEach((token) => {
  assert(!api.includes(token), `fake/demo local API token must not be reintroduced: ${token}`);
});

assert(/const\s+sampleThreads\s*=\s*\[\s*\];/.test(api), 'sampleThreads must remain an empty array');
assert(/const\s+samplePosts\s*=\s*\[\s*\];/.test(api), 'samplePosts must remain an empty array');

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

console.log('local API no-seed regression test passed');
