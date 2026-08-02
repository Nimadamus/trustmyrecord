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

// The quiz lifecycle moved from the v1 trivia routes to trivia v2
// (routes/triviaV2.js): a session is opened with POST /trivia/v2/sessions,
// questions are pulled one at a time from /sessions/:id/next, answers are
// submitted against the ATTEMPT (POST /trivia/v2/attempts/:id/answer), and
// boards come from /trivia/v2/leaderboards. The v1 tokens this guard used to
// assert (/trivia/sessions, /trivia/sessions/:id/answer, /trivia/leaderboard)
// no longer exist on the page, which is what made this test fail on every
// commit. The guarantee is unchanged and now covers the full v2 lifecycle:
// every screen must be driven by a real backend call, never local/demo data.
[
  // v2 quiz lifecycle
  "api.request('/trivia/v2/categories'",
  "api.request('/trivia/v2/scoring'",
  "api.request('/trivia/v2/sessions'",
  "api.request('/trivia/v2/sessions/' + sessionId + '/next'",
  "api.request('/trivia/v2/attempts/' + currentAttemptId + '/answer'",
  "api.request('/trivia/v2/attempts/' + attemptId + '/forfeit'",
  "api.request('/trivia/v2/attempts/active'",
  // v2 stats + boards
  "api.request('/trivia/v2/me/stats'",
  "api.request('/trivia/v2/leaderboards?board='",
  "api.request('/trivia/v2/users/' + encodeURIComponent(username",
  // still-live v1 routes: category browsing, user-submitted questions,
  // reporting, and the creators board
  "api.request('/trivia/categories'",
  "api.request('/trivia/leaderboard/creators?limit=50')",
  "api.request('/trivia/questions'",
  "api.request('/trivia/questions/' + currentQuestion.id + '/report'",
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
