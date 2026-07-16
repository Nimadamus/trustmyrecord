#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'arena', 'index.html'), 'utf8');

for (const required of [
  'tmr-sitewide.css?v=',
  'tmr-sitewide.js?v=',
  // e5269b2b replaced the arena-clean-* hero/proof strip with the compact
  // dashboard layout. Lock that redesign by its own marker and structure.
  'ARENA_PRO_20260711',
  'class="arena-head"',
  'class="arena-actions-grid"',
  'class="arena-action-card"',
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
  // Styles of the ARENA_PRO_20260711 dashboard that replaced arena-clean-*.
  '.arena-head {',
  '.arena-actions-grid {',
  '.arena-action-card {',
  '.arena-action-icon {',
  '.arena-more-grid {',
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
