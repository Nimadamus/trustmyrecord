#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'static', 'css', 'tmr-sitewide.css'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'static', 'js', 'tmr-sitewide.js'), 'utf8');
const productSystem = fs.readFileSync(path.join(root, 'TRUSTMYRECORD_PRODUCT_UPGRADE_SYSTEM.md'), 'utf8');

for (const token of [
  '--tmr-app-bg',
  '--tmr-card',
  '--tmr-border',
  '--tmr-text-strong',
  '--tmr-accent',
  '--tmr-radius-sm',
  '--tmr-radius-md',
  '--tmr-shadow-card',
]) {
  assert(css.includes(token), `sitewide design token missing: ${token}`);
}

for (const selector of [
  'body.tmr-site-shell',
  '.tmr-global-nav',
  '.tmr-global-nav__brand',
  '.tmr-global-nav__button--primary',
  '.tmr-empty',
  '.tmr-empty__icon',
  '.tmr-empty-state',
  '.tmr-loading-state',
  '.tmr-spinner',
  '.tmr-table-wrap',
  '.tmr-cap-card',
  '.tmr-pick-table',
  '.tmr-sport-tag--mlb',
  '.tmr-sport-tag--nhl',
  '@media (max-width: 860px)',
  '@media (max-width: 720px)',
]) {
  assert(css.includes(selector), `sitewide design selector missing: ${selector}`);
}

assert(css.includes('linear-gradient') && css.includes('rgba(45, 212, 191'), 'sitewide design system must keep dark premium accent treatments');
assert(css.includes('body.tmr-site-shell .btn-primary') && css.includes('body.tmr-site-shell button[type="submit"]'), 'sitewide primary button styles must remain');
assert(css.includes('body.tmr-site-shell input') && css.includes('body.tmr-site-shell select') && css.includes('body.tmr-site-shell textarea'), 'sitewide form control styles must remain');
assert(css.includes('body.tmr-site-shell select') && css.includes('appearance: none') && css.includes('padding-right: 38px'), 'sitewide select controls must remain branded');
assert(css.includes(':focus-visible') && css.includes('outline-offset: 3px'), 'sitewide keyboard focus ring must remain visible');
assert(css.includes('[aria-disabled="true"]') && css.includes('cursor: not-allowed'), 'sitewide disabled control treatment must remain');
assert(css.includes('display: inline-flex') && css.includes('justify-content: center'), 'sitewide button alignment must remain stable');
assert(css.includes('body.tmr-site-shell table') && css.includes('body.tmr-site-shell th') && css.includes('body.tmr-site-shell td'), 'sitewide table styles must remain');
assert(css.includes('body.tmr-site-shell .tmr-table-wrap') && css.includes('overflow-x: auto'), 'sitewide table wrapper must keep responsive scrolling');
assert(css.includes('font-variant-numeric: tabular-nums') && css.includes('td[data-type="number"]'), 'sitewide numeric table alignment must remain');
assert(css.includes('body.tmr-site-shell tbody tr:hover td') && css.includes('rgba(45, 212, 191, 0.035)'), 'sitewide table row hover treatment must remain branded');
assert(css.includes('body.tmr-site-shell .empty-state') && css.includes('body.tmr-site-shell .loading-state') && css.includes('body.tmr-site-shell .error-state'), 'sitewide empty/loading/error styles must remain');
assert(css.includes('body.tmr-site-shell .tmr-empty-state') && css.includes('body.tmr-site-shell .tmr-loading-state'), 'legacy live empty/loading state variants must remain styled');
assert(css.includes('@keyframes tmr-spin') && css.includes('border-top-color: var(--tmr-accent)'), 'sitewide loading spinner style must remain branded');

for (const required of [
  'tmr-global-nav',
  'tmr-global-nav__brand',
  'buildLoggedOutActions',
  'buildLoggedInActions',
  'data-tmr-route',
]) {
  assert(nav.includes(required), `sitewide navigation source missing ${required}`);
}

for (const page of [
  'index.html',
  'sportsbook/index.html',
  'profile/index.html',
  'polls/index.html',
  'arena/index.html',
  'leaderboards/index.html',
  'handicappers/index.html',
  'feed/index.html',
  'marketplace/index.html',
]) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert(/tmr-sitewide\.css\?v=/.test(html), `${page} must load cache-busted sitewide CSS`);
  assert(/tmr-sitewide\.js\?v=/.test(html), `${page} must load cache-busted sitewide nav JS`);
}

for (const section of [
  'Design Bible',
  'Phase 2: Shared Design System Cleanup',
  'Buttons',
  'Cards',
  'Forms',
  'Tables',
  'Empty States',
  'Mobile Layouts',
]) {
  assert(productSystem.includes(section), `product upgrade system missing ${section}`);
}

console.log('sitewide design system regression test passed');
