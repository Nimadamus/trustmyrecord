const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'static', 'js', 'api.js'), 'utf8');

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

console.log('local API no-seed regression test passed');
