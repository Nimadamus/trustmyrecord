const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Route shim regression failed: ${message}`);
    process.exit(1);
  }
}

const shims = [
  {
    file: 'polls-trivia/index.html',
    target: '/polls/',
    canonical: 'https://trustmyrecord.com/polls/',
    label: 'Continue to Polls',
    forbiddenTargets: ['/hangout/']
  },
  {
    file: 'forums/index.html',
    target: '/forum/',
    canonical: 'https://trustmyrecord.com/forum/',
    label: 'Continue',
    forbiddenTargets: []
  },
  {
    file: 'leaderboard/index.html',
    target: '/leaderboards/',
    canonical: null,
    label: 'Leaderboards',
    forbiddenTargets: []
  },
  {
    file: 'cappers/index.html',
    target: '/handicappers/',
    canonical: null,
    label: 'Handicappers',
    forbiddenTargets: []
  }
];

for (const shim of shims) {
  const html = read(shim.file);
  assert(html.includes(`url=${shim.target}`) || html.includes(`url=${shim.target.replace(/\/$/, '')}`), `${shim.file} refresh target is wrong`);
  assert(html.includes(`location.replace('${shim.target}'`) || html.includes(`location.replace("${shim.target}"`) || html.includes(`location.replace('${shim.target}' +`), `${shim.file} script target is wrong`);
  assert(html.includes(`href="${shim.target}"`), `${shim.file} fallback link is wrong`);
  assert(html.includes(shim.label), `${shim.file} fallback label is missing`);

  if (shim.canonical) {
    assert(html.includes(`href="${shim.canonical}"`), `${shim.file} canonical target is wrong`);
  }

  for (const forbidden of shim.forbiddenTargets) {
    assert(!html.includes(forbidden), `${shim.file} still references ${forbidden}`);
  }
}

console.log('route shim regression test passed');
