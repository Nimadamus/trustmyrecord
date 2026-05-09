const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const navigation = read('static/js/navigation.js');
const sportsbookReliability = read('static/js/sportsbook-production-fix-persist-reliability.js');
const sportsbookPersist = read('static/js/sportsbook-production-fix-persist.js');
const sportsbookLegacy = read('static/js/sportsbook-production-fix.js');

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
    file: 'predictions/index.html',
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

[
  "leaderboards: 'leaderboards/'",
  "forums: 'forum/'",
  "'polls-trivia': 'polls/'"
].forEach((token) => {
  assert(navigation.includes(token), `navigation legacy route target missing: ${token}`);
});

[
  "leaderboards: 'handicappers/'",
  "forums: 'forums/'",
  "'polls-trivia': 'polls-trivia/'"
].forEach((token) => {
  assert(!navigation.includes(token), `navigation legacy route drift returned: ${token}`);
});

assert(sportsbookReliability.includes("'polls-trivia': 'polls.html'"), 'sportsbook legacy polls-trivia route must target polls');
assert(!sportsbookReliability.includes("'polls-trivia': 'hangout.html'"), 'sportsbook legacy polls-trivia route regressed to hangout');
assert(sportsbookReliability.includes("predictions: 'polls.html'"), 'sportsbook legacy predictions route must target polls');
assert(!sportsbookReliability.includes("predictions: 'hangout.html'"), 'sportsbook legacy predictions route regressed to hangout');

[sportsbookReliability, sportsbookPersist, sportsbookLegacy].forEach((script, index) => {
  assert(script.includes("'polls-trivia': 'polls.html'"), `sportsbook route map ${index} must keep polls-trivia on polls`);
  assert(script.includes("predictions: 'polls.html'"), `sportsbook route map ${index} must keep predictions on polls`);
  assert(!script.includes("'polls-trivia': 'hangout.html'"), `sportsbook route map ${index} regressed polls-trivia to hangout`);
  assert(!script.includes("predictions: 'hangout.html'"), `sportsbook route map ${index} regressed predictions to hangout`);
});

console.log('route shim regression test passed');
