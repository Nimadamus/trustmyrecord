const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'trivia', 'index.html'), 'utf8');
// d5ae007b removed the duplicate per-page footers; the nav and footer are now
// injected by tmr-sitewide.js, so the shared routes are guarded there.
const sitewide = fs.readFileSync(path.join(root, 'static', 'js', 'tmr-sitewide.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`Trivia regression failed: ${message}`);
    process.exit(1);
  }
}

assert(html.includes('TRIVIA_BACKEND_UI_GUARD_20260509'), 'protected trivia marker is missing');
assert(html.includes('<link rel="canonical" href="https://trustmyrecord.com/trivia/">'), 'canonical trivia route is missing');
assert(html.includes('tmr-sitewide.css?v='), 'sitewide CSS include is missing');
assert(html.includes('tmr-sitewide.js?v='), 'sitewide JS include is missing');
assert(html.includes('/static/js/backend-api.js'), 'backend API include is missing');

[
  'id="categoriesGrid"',
  'id="leaderboardList"',
  'id="leaderboardCreatorsList"',
  'id="historyList"',
  'id="createQuestionCard"',
  'id="customQuestionsList"',
  'id="quizOverlay"',
  'id="quizContainer"',
  'id="statQuestionsAnswered"',
  'id="statAccuracy"',
  'id="statTotalPoints"',
  'id="statQuestionsCorrect"'
].forEach((token) => {
  assert(html.includes(token), `missing protected DOM token: ${token}`);
});

[
  "api.request('/trivia/categories'",
  "api.request('/trivia/sessions'",
  "api.request('/trivia/sessions/' + sessionId + '/answer'",
  "api.request('/trivia/leaderboard')",
  "api.request('/trivia/leaderboard/creators?limit=50')",
  "api.request('/trivia/questions'",
  "api.request('/trivia/questions/' + currentQuestion.id + '/report'",
  "api.request('/trivia/users/' + encodeURIComponent(username) + '/stats'",
  "api.request('/trivia/users/' + encodeURIComponent(username) + '/created'"
].forEach((token) => {
  assert(html.includes(token), `missing backend trivia call: ${token}`);
});

[
  '/sportsbook/',
  '/leaderboards/',
  '/arena/',
  '/forum/',
  '/feed/',
  '/polls/',
  '/trivia/',
  '/about/',
  '/terms/',
  '/privacy/'
].forEach((route) => {
  assert(sitewide.includes(`href="${route}"`), `missing route ${route} in injected sitewide nav/footer`);
});

// The footer now carries Polls and Hangout as separate destinations, so the old
// blanket "no /hangout/ anywhere" check no longer expresses the intent. What must
// hold is that the Polls entry still points at /polls/.
assert(sitewide.includes('<a href="/polls/">Polls</a>'), 'footer Polls link regressed away from /polls/');
assert(!html.includes('sampleQuestions = ['), 'hard-coded sample questions were reintroduced');
assert(!html.includes('demoLeaderboard') && !html.includes('fakeLeaderboard'), 'fake leaderboard data was reintroduced');
assert(html.includes('Submitted questions may be reviewed before going live.'), 'moderation copy is missing');
assert(html.includes('Other users can report your questions'), 'report/moderation warning is missing');
assert(html.includes('You will not see your own questions in the quiz.'), 'self-question exclusion copy is missing');

console.log('Trivia page regression test passed.');
