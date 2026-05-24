#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'leaderboards', 'index.html'), 'utf8');

for (const required of [
  'LEADERBOARDS_PREMIUM_DARK_UI_20260508',
  '<link rel="canonical" href="https://trustmyrecord.com/leaderboards/">',
  'tmr-sitewide.css?v=',
  'tmr-sitewide.js?v=',
  'sortBy=net_units',
  'positive net units',
  '5 graded picks',
  'data-tab="handicappers"',
  'data-tab="trivia"',
  'data-tab="polls"',
  'data-tab="online"',
  'data-tab="h2h"',
  'id="leaderboardBody"',
  'id="capperSearch"',
  'id="sportFilter"',
  'id="sortFilter"',
  'id="sampleFilter"',
  'function emptyStateHtml(opts)',
  'function setStateAsEmpty(stateEl, html)',
  'window.api.getLeaderboard',
  'href="/arena/?challenge=new"',
]) {
  assert(html.includes(required), `leaderboards page missing protected token: ${required}`);
}

for (const cssToken of [
  'body::before',
  '.hero::after',
  'grid-template-columns: repeat(5, minmax(150px, 1fr))',
  'appearance: none',
  '.empty-state {',
  'radial-gradient(circle at top, rgba(45,212,191,0.07)',
  '@media (max-width: 720px)',
]) {
  assert(html.includes(cssToken), `leaderboards premium visual CSS missing: ${cssToken}`);
}

assert(!html.includes('background: #fff'), 'leaderboards page must not reintroduce bright white panels');
assert(!html.includes('background: white'), 'leaderboards page must not reintroduce white panels');
assert(html.includes('No fake records.'), 'leaderboards hero must keep no-fake-records trust copy');

console.log('leaderboards page visual regression test passed');
