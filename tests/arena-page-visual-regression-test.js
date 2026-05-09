#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'arena', 'index.html'), 'utf8');

for (const required of [
  'tmr-sitewide.css?v=',
  'tmr-sitewide.js?v=',
  'class="arena-clean-hero"',
  'class="arena-clean-proof"',
  'Verified outcomes only',
  'Rivalry-ready matchups',
  'Records tied to activity',
  'id="openChallengesSection"',
  'id="challengesList"',
  'onclick="openCreateChallenge()"',
  'onclick="scrollToChallenges(event)"',
  'function renderOpenChallengesEmptyState(filtered)',
  'function renderOpenChallengesErrorState()',
]) {
  assert(html.includes(required), `arena page missing required visual/function marker: ${required}`);
}

for (const requiredStyle of [
  '.arena-clean-hero::before',
  '.arena-clean-proof span',
  '.arena-hub-card {',
  'radial-gradient(circle at 20% 0%, rgba(45, 212, 191, 0.10)',
  '.arena-clean-section {',
  '.arena-list-grid .challenge-card',
  '.cc-status {',
  '.empty-state .arena-empty-action',
  '.loading {',
  '@media (max-width: 640px)',
]) {
  assert(html.includes(requiredStyle), `arena page missing premium dark visual style: ${requiredStyle}`);
}

for (const requiredCopy of [
  'No open challenges yet.',
  'Create the first Arena challenge',
  'Open challenges could not be loaded.',
  'The Arena feed may be warming up.',
  'Retry',
  'No challenges match this view yet.',
]) {
  assert(html.includes(requiredCopy), `arena empty/error state copy missing: ${requiredCopy}`);
}

assert(!html.includes('background: #fff'), 'arena page must not reintroduce a white admin panel');
assert(!html.includes('background-color: #fff'), 'arena page must not reintroduce a white admin panel');
assert(!html.includes('No open challenges yet. Create the first Arena challenge.</h3></div>'), 'arena empty state must include helpful copy and action');

console.log('arena page visual regression test passed');
