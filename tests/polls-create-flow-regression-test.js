#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'polls', 'index.html'), 'utf8');

for (const required of [
  'onclick="openCreatePollModal()"',
  'id="createPollModal"',
  'id="createPollForm" onsubmit="submitNewPoll(event)"',
  'function openCreatePollModal()',
  'function closeCreatePollModal()',
  'async function submitNewPoll(e)',
  'id="createPollSubmit"',
  'id="createPollError"',
  'id="pollTitle"',
  'id="pollQuestion"',
  'id="pollSport"',
  'id="pollLeague"',
  'id="pollOptions"',
  "addOptionRow('pollOptions')",
  'id="pollCategory"',
  'id="pollExpires"',
  'id="pollAllowMultiple"',
  'id="pollPublicResults"',
  'id="pollAnonymous"',
  // The Jul 12 redesign moved the sport/league filters onto `state`; the
  // Aug 2 rebuild replaced #filterBar / #pollsTabBar with the sticky
  // #pollsFilterBar (league chips + view chips). Guard the current shape.
  'state.sportFilter',
  'state.leagueFilter',
  'id="pollsFilterBar"',
  'id="leagueChips"',
  'id="viewChips"',
  // After publishing, the create flow still lands the author on the new poll.
  "switchTab(isSeason ? 'quiz' : 'quick')",
  'function switchTab(tab)',
  'openPoll(data.poll.id);',
  "api.request('/polls', { method: 'POST', body: payload })",
  "payload.options = options;",
  'scoring_mode: scoringMode',
  "if (!publicResults) descParts.push('[hide-results-until-vote]');",
  "if (anonymous) descParts.push('[anonymous]');",
  // Multi-select is a real poll_type now, not a '[multi-choice]' description tag.
  "payload.poll_type = 'prediction_multi';",
  'payload.numeric_target = Number(numericTargetRaw)',
  // Empty board still invites the first poll instead of dead-ending. The copy
  // was rewritten when polls became multi-question quizzes; the guarantee is
  // unchanged, so assert the current invite and its primary action rather than
  // the retired "You're early. Start today's debate." string.
  'No open polls right now.',
  '<i class="fas fa-plus" aria-hidden="true"></i> Create a Poll',
  'function templateChipsHtml(',
]) {
  assert(html.includes(required), `polls create-flow guard missing: ${required}`);
}

for (const requiredValidation of [
  'Title must be at least 5 characters.',
  'Question must be at least 5 characters.',
  'Choose a sport so this poll can be organized correctly.',
  'Provide at least 2 answer choices (or switch to Closest-numeric scoring).',
]) {
  assert(html.includes(requiredValidation), `poll create validation copy missing: ${requiredValidation}`);
}

assert(!html.includes('mockPolls'), 'polls page must not reintroduce fake poll fixtures');
assert(!html.includes('demoPolls'), 'polls page must not reintroduce demo poll fixtures');
assert(!html.includes('placeholder polls'), 'polls page must not reintroduce placeholder poll data');

console.log('polls create-flow regression test passed');
