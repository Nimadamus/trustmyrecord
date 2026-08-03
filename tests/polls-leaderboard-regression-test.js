#!/usr/bin/env node
/**
 * Poll leaderboard lock — /polls/ leaderboard section.
 *
 * Static structural test (no network, no DB): it asserts the section exists,
 * carries every required filter/column, and — most importantly — that the page
 * never invents its own numbers. Every figure on the leaderboard must come out
 * of GET /api/polls/leaderboard, which derives it from real graded votes.
 *
 * Companion backend test: trustmyrecord-backend/tests/poll-leaderboard-board-test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'polls', 'index.html'), 'utf8');
let checks = 0;
const ok = (label, cond) => { assert.ok(cond, label); checks++; console.log('  ✓ ' + label); };

console.log('\nSection and entry points');
ok('the leaderboard section exists', /id="pollLeaderboard"/.test(html));
ok('it sits below the poll content area, above the poll detail pane',
  html.indexOf('id="pollLeaderboard"') > html.indexOf('id="pollsSection"') &&
  html.indexOf('id="pollLeaderboard"') < html.indexOf('id="pollDetail"'));
ok('a Leaderboard chip sits in the view row next to Closed',
  /data-view="closed"[\s\S]{0,400}id="lbJumpChip"/.test(html));
ok('the chip jumps to the section instead of hijacking the poll view',
  /id="lbJumpChip"[^>]*onclick="jumpToLeaderboard\(\)"/.test(html) &&
  !/id="lbJumpChip"[^>]*setView/.test(html));
ok('the existing poll views are untouched',
  ['open', 'ending', 'most_voted', 'voted', 'closed']
    .every((v) => new RegExp('data-view="' + v + '"').test(html)));

console.log('\nFilters');
['today', 'week', 'month', 'all'].forEach((p) => {
  ok('period filter: ' + p, new RegExp('data-period="' + p + '"').test(html));
});
['MLB', 'NFL', 'NBA', 'WNBA', 'NHL', 'all'].forEach((l) => {
  ok('sport filter: ' + l, new RegExp('data-lbleague="' + l + '"').test(html));
});
ok('both filter groups are sent to the API', /period=' \+ encodeURIComponent\(lb\.period\)/.test(html) &&
  /league=' \+ encodeURIComponent\(lb\.league\)/.test(html));

console.log('\nColumns');
[
  ['rank', /<th scope="col">#<\/th>/],
  ['player', /<th scope="col">Player<\/th>/],
  ['polls entered', /title="Polls entered"/],
  ['correct picks', /title="Correct picks"/],
  ['incorrect picks', /title="Incorrect picks"/],
  ['pending picks', /title="Picks still awaiting a final result"/],
  ['win percentage', /title="Correct \/ graded picks"/],
  ['current streak', /title="Current correct streak"/],
  ['best streak', /title="Best correct streak"/],
  ['points', /<th scope="col">Points<\/th>/],
  ['TMR earned', /pl-lb-tmrcol/],
].forEach(([label, re]) => ok('column: ' + label, re.test(html)));

console.log('\nReal data only');
ok('rows come from the leaderboard API', /api\.request\('\/polls\/leaderboard\?/.test(html));
ok('rank is taken from the server, never recomputed client-side',
  /lbRankHtml\(r\.rank\)/.test(html) && !/rank:\s*i\s*\+\s*1/.test(html.slice(html.indexOf('POLL LEADERBOARD'))));
ok('accuracy renders a dash rather than a fabricated 0% or 100%',
  /prediction_accuracy === null \|\| row\.prediction_accuracy === undefined/.test(html));
ok('the empty state says so instead of showing placeholder players',
  /No graded entries yet/.test(html));
ok('the empty state explains that grading waits for final games',
  /Polls are scored only after the games are final/.test(html));

console.log('\nUser experience');
ok('the signed-in row is pinned/highlighted', /tr class="' \+ \(you \? 'is-you' : ''\)/.test(html) &&
  /\.pl-lb-table tr\.is-you td/.test(html));
ok('a separate Your Rank card exists for players off the visible page',
  /function renderLbYourRankCard/.test(html) && /Your rank<\/span>/.test(html));
ok('the Your Rank card is suppressed when the row is already visible',
  /if \(onPage\) return '';/.test(html));
ok('top three get medals', /\.pl-lb-rank\.m1/.test(html) && /\.pl-lb-rank\.m2/.test(html) && /\.pl-lb-rank\.m3/.test(html));
ok('usernames link to the public profile', /lbProfileHref\(r\.username\)/.test(html) &&
  /'\/profile\/\?user=' \+ encodeURIComponent/.test(html));
ok('there is a Load More after the first page', /loadMoreLeaderboard/.test(html) && /var LB_PAGE = 25;/.test(html));
ok('a personal stats card is present', /Your poll stats/.test(html));
ok('the personal card carries rank, points, polls, correct, accuracy and streaks',
  /Rank #' \+ y\.rank/.test(html) && /stat\('Points'/.test(html) && /stat\('Polls'/.test(html) &&
  /stat\('Correct'/.test(html) && /stat\('Accuracy'/.test(html) && /stat\('Streak'/.test(html));
ok('a How scoring works panel is expandable', /class="pl-lb-how"/.test(html) && /How scoring works/.test(html));
ok('the scoring panel is driven by the API config, not hard-coded numbers',
  /state\.lb\.scoring/.test(html) && /s\.points_correct/.test(html));
ok('the last update time is shown', /id="pollLbUpdated"/.test(html) && /last_graded_at/.test(html));

console.log('\nSummary cards');
['Participants', 'Poll entries', 'Highest score', 'Best accuracy', 'Current leader'].forEach((c) => {
  ok('summary card: ' + c, new RegExp("card\\('" + c + "'").test(html));
});

console.log('\nMobile');
ok('the table is replaced by cards on a phone',
  /@media \(max-width: 720px\)[\s\S]{0,600}\.pl-lb-tablewrap \{ display: none; \}/.test(html));
ok('the card list is hidden on desktop', /\.pl-lb-cardlist \{ display: none; \}/.test(html));
ok('the table scrolls horizontally rather than breaking the page',
  /\.pl-lb-tablewrap \{ overflow-x: auto;/.test(html));

console.log('\nRace safety');
ok('a filter click is never dropped because a fetch is open',
  /if \(lb\.loading && !opts\.reset\) return;/.test(html));
ok('a stale response cannot overwrite a newer filter', /if \(seq !== lb\.seq\) return;/.test(html));

console.log('\n' + checks + ' checks passed');
console.log('polls leaderboard regression test passed');
