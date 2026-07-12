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
    file: 'account/index.html',
    target: '/profile/',
    canonical: null,
    label: 'Profile',
    forbiddenTargets: []
  },
  {
    file: 'community/index.html',
    target: '/feed/',
    canonical: null,
    label: 'Feed',
    forbiddenTargets: []
  },
  {
    file: 'dashboard/index.html',
    target: '/profile/',
    canonical: null,
    label: 'Profile',
    forbiddenTargets: []
  },
  {
    file: 'directory/index.html',
    target: '/handicappers/',
    canonical: null,
    label: 'Handicappers',
    forbiddenTargets: []
  },
  {
    file: 'challenges/index.html',
    target: '/arena/',
    canonical: 'https://trustmyrecord.com/arena/',
    label: 'Continue to Arena',
    forbiddenTargets: []
  },
  {
    file: 'consensus/index.html',
    target: '/sportsbook/#consensus',
    canonical: 'https://trustmyrecord.com/sportsbook/#consensus',
    label: 'Continue',
    forbiddenTargets: []
  },
  {
    file: 'polls-trivia/index.html',
    target: '/polls/',
    canonical: 'https://trustmyrecord.com/polls/',
    label: 'Continue to Polls',
    forbiddenTargets: ['/hangout/']
  },
  {
    file: 'groups/index.html',
    target: '/friends/',
    canonical: 'https://trustmyrecord.com/friends/',
    label: 'Continue',
    forbiddenTargets: []
  },
  {
    file: 'live/index.html',
    target: '/sportsbook/',
    canonical: 'https://trustmyrecord.com/sportsbook/',
    label: 'Continue',
    forbiddenTargets: []
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
    file: 'make-picks/index.html',
    target: '/sportsbook/',
    canonical: null,
    label: 'Make Picks',
    forbiddenTargets: []
  },
  {
    file: 'cappers/index.html',
    target: '/handicappers/',
    canonical: null,
    label: 'Handicappers',
    forbiddenTargets: []
  },
  {
    file: 'members/index.html',
    target: '/handicappers/',
    canonical: null,
    label: 'Handicappers',
    forbiddenTargets: []
  },
  {
    file: 'my-record/index.html',
    target: '/sportsbook/#my-record',
    canonical: 'https://trustmyrecord.com/sportsbook/#my-record',
    label: 'Continue',
    forbiddenTargets: []
  },
  {
    file: 'mypicks/index.html',
    target: '/sportsbook/#mypicks',
    canonical: 'https://trustmyrecord.com/sportsbook/#mypicks',
    label: 'Continue',
    // Query-preserving JS redirect: keeps ?pick=<id> from notification deep
    // links AHEAD of the #mypicks fragment (the old form appended ?pick after
    // the hash, which the sportsbook page could never read).
    scriptTarget: "location.replace('/sportsbook/' + window.location.search + '#mypicks')",
    forbiddenTargets: []
  },
  {
    file: 'pick/index.html',
    target: '/sportsbook/',
    canonical: null,
    label: 'Make Picks',
    forbiddenTargets: []
  },
  {
    file: 'promos/index.html',
    target: '/sportsbook/#promos',
    canonical: 'https://trustmyrecord.com/sportsbook/#promos',
    label: 'Continue',
    forbiddenTargets: []
  },
  {
    file: 'signin/index.html',
    target: '/login/',
    canonical: null,
    label: 'Login',
    forbiddenTargets: []
  },
  {
    file: 'signup/index.html',
    target: '/register/',
    canonical: null,
    label: 'Register',
    forbiddenTargets: []
  },
  {
    file: 'submit/index.html',
    target: '/sportsbook/',
    canonical: null,
    label: 'Make Picks',
    forbiddenTargets: []
  },
  {
    file: 'submit-pick/index.html',
    target: '/sportsbook/',
    canonical: null,
    label: 'Make Picks',
    forbiddenTargets: []
  }
];

for (const shim of shims) {
  const html = read(shim.file);
  assert(html.includes(`url=${shim.target}`) || html.includes(`url=${shim.target.replace(/\/$/, '')}`), `${shim.file} refresh target is wrong`);
  assert(html.includes(`location.replace('${shim.target}'`) || html.includes(`location.replace("${shim.target}"`) || html.includes(`location.replace('${shim.target}' +`) || (shim.scriptTarget && html.includes(shim.scriptTarget)), `${shim.file} script target is wrong`);
  assert(html.includes(`href="${shim.target}"`), `${shim.file} fallback link is wrong`);
  assert(html.includes(shim.label), `${shim.file} fallback label is missing`);

  if (shim.canonical) {
    assert(html.includes(`href="${shim.canonical}"`), `${shim.file} canonical target is wrong`);
  }

  for (const forbidden of shim.forbiddenTargets) {
    assert(!html.includes(forbidden), `${shim.file} still references ${forbidden}`);
  }
}

const predictionsHtml = read('predictions/index.html');
assert(predictionsHtml.includes('<title>MLB Run Prediction Model | TrustMyRecord</title>'), 'predictions page should remain the MLB prediction model page');
assert(predictionsHtml.includes('href="https://trustmyrecord.com/predictions/"'), 'predictions page canonical should stay on /predictions/');
assert(!predictionsHtml.includes('url=/polls/'), 'predictions page must not regress into the polls shim');
assert(!predictionsHtml.includes('url=/hangout/'), 'predictions page must not regress into the hangout shim');

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
