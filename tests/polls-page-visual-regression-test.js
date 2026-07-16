#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'polls', 'index.html'), 'utf8');

for (const required of [
  'tmr-sitewide.css?v=',
  'tmr-sitewide.js?v=',
  // ea233c70 rebuilt this page: the tmr-fb-sidebar / tmr-polls-panel / banner-grid
  // shell became the tmr-shell2 layout with three participation cards, the filters
  // moved from standalone ids onto `state` behind #filterBar, and the hero copy
  // and empty-state wording changed. Lock the current shape.
  'class="tmr-shell2"',
  'class="tmr-pcard"',
  'class="tmr-pcard is-accent"',
  '<h1>Polls &amp; Predictions</h1>',
  'class="tmr-hbtn is-primary"',
  'id="filterBar"',
  'state.sportFilter',
  'state.leagueFilter',
  'id="pollsTabBar"',
  'class="tmr-tab2 is-active"',
  'id="featuredQuizSlot"',
  'Be the first to lock in.',
]) {
  assert(html.includes(required), `polls page missing required visual/function marker: ${required}`);
}

for (const requiredStyle of [
  'linear-gradient(135deg, rgba(15, 23, 42',
  '.tmr-fb-sidebar { position: sticky; top: 18px; background: linear-gradient',
  '.tmr-fb-sidebar::before',
  '.tmr-polls-panel { background: linear-gradient',
  '.tmr-fb-banner { position: relative;',
  '.tmr-fb-banner-stats',
  '.tmr-filter-control label',
  'select.tmr-fb-action-btn',
  '.tmr-fb-tab.is-active',
  '.tmr-empty-msg { margin: 18px; padding: 46px 24px;',
  '@media (max-width: 960px)',
  '@media (max-width: 640px)',
]) {
  assert(html.includes(requiredStyle), `polls page missing required premium dark style: ${requiredStyle}`);
}

assert(!html.includes('background: #fff'), 'polls page must not reintroduce a giant white panel');
assert(!html.includes('background:white'), 'polls page must not reintroduce a giant white panel');
assert(!html.includes('background-color: #fff'), 'polls page must not reintroduce a giant white panel');
assert(!html.includes('background: #f5f5f5'), 'polls page sidebar/content must not regress to pale admin gray');

console.log('polls page visual regression test passed');
