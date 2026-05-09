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
  '--tmr-gap-sm',
  '--tmr-gap-md',
  '--tmr-gap-lg',
  '--tmr-card-pad',
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
  '.tmr-skeleton',
  '.tmr-skeleton-line',
  '.tmr-skeleton-block',
  '.tmr-skeleton-avatar',
  '.tmr-table-wrap',
  '.tmr-page-head',
  '.tmr-page-title',
  '.tmr-page-subtitle',
  '.tmr-stack',
  '.tmr-cluster',
  '.tmr-grid',
  '.tmr-segmented',
  '.tmr-tab',
  '.tmr-filter-bar',
  '.tmr-filter-chip',
  '.tmr-modal-backdrop',
  '.tmr-modal',
  '.tmr-modal__head',
  '.tmr-modal__body',
  '.tmr-modal__actions',
  '.tmr-menu',
  '.tmr-menu__item',
  '.tmr-menu__label',
  '.tmr-menu__divider',
  '.tmr-tooltip',
  '.tmr-help-text',
  '.tmr-sr-only',
  '.tmr-pagination',
  '.tmr-page-button',
  '.tmr-count-summary',
  '.tmr-metric-grid',
  '.tmr-metric-card',
  '.tmr-metric-label',
  '.tmr-metric-value',
  '.tmr-metric-note',
  '.tmr-feed-list',
  '.tmr-feed-item',
  '.tmr-feed-avatar',
  '.tmr-feed-title',
  '.tmr-feed-meta',
  '.tmr-feed-actions',
  '.tmr-action-bar',
  '.tmr-action-group',
  '.tmr-action-link',
  '.tmr-breadcrumb',
  '.tmr-breadcrumb__link',
  '.tmr-breadcrumb__sep',
  '.tmr-breadcrumb__current',
  '.tmr-badge',
  '.tmr-status',
  '.tmr-result-chip',
  '.tmr-alert',
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
assert(css.includes('.tmr-page-head') && css.includes('.tmr-page-title') && css.includes('.tmr-page-subtitle'), 'sitewide page title primitives must remain');
assert(css.includes('.tmr-grid') && css.includes('repeat(auto-fit') && css.includes('minmax(min(100%, 260px), 1fr)'), 'sitewide responsive grid primitive must remain');
assert(css.includes('.tmr-cluster') && css.includes('flex-wrap: wrap') && css.includes('.tmr-stack'), 'sitewide stack and cluster layout primitives must remain');
assert(css.includes('.tmr-segmented') && css.includes('.tmr-filter-bar') && css.includes('.tmr-tab.is-active') && css.includes('.tmr-filter-chip[aria-pressed="true"]'), 'sitewide segmented tab/filter primitives must remain');
assert(css.includes('.tmr-tab[aria-selected="true"]') && css.includes('white-space: nowrap'), 'sitewide tab active state and wrapping protection must remain');
assert(css.includes('.tmr-modal-backdrop.is-open') && css.includes('.tmr-modal-backdrop[aria-hidden="false"]'), 'sitewide modal open states must remain');
assert(css.includes('.tmr-modal__head') && css.includes('.tmr-modal__body') && css.includes('.tmr-modal__actions'), 'sitewide modal structure primitives must remain');
assert(css.includes('grid-template-rows: auto minmax(0, 1fr) auto') && css.includes('max-height: min(86vh, 820px)'), 'sitewide modal sizing must remain responsive');
assert(css.includes('.tmr-menu__item--danger') && css.includes('.tmr-menu__item[aria-current="page"]'), 'sitewide menu states must remain');
assert(css.includes('min-width: min(260px, calc(100vw - 32px))') && css.includes('max-width: min(360px, calc(100vw - 32px))'), 'sitewide menu responsive sizing must remain');
assert(css.includes('.tmr-tooltip[data-tooltip]::after') && css.includes('content: attr(data-tooltip)') && css.includes('.tmr-tooltip:focus-within[data-tooltip]::after'), 'sitewide tooltip primitive must remain accessible');
assert(css.includes('.tmr-help-text') && css.includes('.tmr-sr-only') && css.includes('clip: rect(0, 0, 0, 0)'), 'sitewide help text and screen-reader utility must remain');
assert(css.includes('.tmr-pagination__controls') && css.includes('.tmr-page-button[aria-current="page"]'), 'sitewide pagination active state must remain');
assert(css.includes('.tmr-page-button[aria-disabled="true"]') && css.includes('.tmr-count-summary'), 'sitewide pagination disabled state and count summary must remain');
assert(css.includes('.tmr-metric-grid') && css.includes('minmax(min(100%, 150px), 1fr)') && css.includes('.tmr-metric-value'), 'sitewide metric grid primitive must remain responsive');
assert(css.includes('font-variant-numeric: tabular-nums') && css.includes('.tmr-metric-value.is-positive') && css.includes('.tmr-metric-value.is-negative'), 'sitewide metric value states must remain readable');
assert(css.includes('.tmr-feed-item') && css.includes('grid-template-columns: auto minmax(0, 1fr)') && css.includes('.tmr-feed-text'), 'sitewide feed/list item primitive must remain');
assert(css.includes('@media (max-width: 520px)') && css.includes('.tmr-feed-avatar') && css.includes('overflow-wrap: anywhere'), 'sitewide feed/list primitive must stay mobile-safe');
assert(css.includes('.tmr-action-bar') && css.includes('.tmr-action-group') && css.includes('.tmr-action-link[aria-pressed="true"]'), 'sitewide action bar primitives must remain');
assert(css.includes('.tmr-action-link--primary') && css.includes('.tmr-action-link--danger') && css.includes('white-space: nowrap'), 'sitewide action link variants must remain readable');
assert(css.includes('.tmr-breadcrumb') && css.includes('.tmr-breadcrumb__current') && css.includes('.tmr-breadcrumb__sep'), 'sitewide breadcrumb primitive must remain');
assert(css.includes('.tmr-breadcrumb a:focus-visible') && css.includes('overflow-wrap: anywhere'), 'sitewide breadcrumb links must remain accessible and wrap-safe');
assert(css.includes('body.tmr-site-shell .section-header > *') && css.includes('body.tmr-site-shell .sportsbook-board-toolbar > *'), 'sitewide header children must keep overflow protection');
assert(css.includes('.tmr-badge--verified') && css.includes('.tmr-status--private') && css.includes('.tmr-result-chip--win') && css.includes('.tmr-result-chip--loss'), 'sitewide badge/status/result primitives must remain');
assert(css.includes('white-space: nowrap') && css.includes('max-width: 100%'), 'sitewide badge primitives must resist broken wrapping');
assert(css.includes('body.tmr-site-shell table') && css.includes('body.tmr-site-shell th') && css.includes('body.tmr-site-shell td'), 'sitewide table styles must remain');
assert(css.includes('body.tmr-site-shell .tmr-table-wrap') && css.includes('overflow-x: auto'), 'sitewide table wrapper must keep responsive scrolling');
assert(css.includes('font-variant-numeric: tabular-nums') && css.includes('td[data-type="number"]'), 'sitewide numeric table alignment must remain');
assert(css.includes('body.tmr-site-shell tbody tr:hover td') && css.includes('rgba(45, 212, 191, 0.035)'), 'sitewide table row hover treatment must remain branded');
assert(css.includes('body.tmr-site-shell .empty-state') && css.includes('body.tmr-site-shell .loading-state') && css.includes('body.tmr-site-shell .error-state'), 'sitewide empty/loading/error styles must remain');
assert(css.includes('body.tmr-site-shell .tmr-empty-state') && css.includes('body.tmr-site-shell .tmr-loading-state'), 'legacy live empty/loading state variants must remain styled');
assert(css.includes('@keyframes tmr-spin') && css.includes('border-top-color: var(--tmr-accent)'), 'sitewide loading spinner style must remain branded');
assert(css.includes('@keyframes tmr-skeleton-shimmer') && css.includes('.tmr-skeleton-stack') && css.includes('prefers-reduced-motion: reduce'), 'sitewide skeleton loading primitives must remain');
assert(css.includes('background-size: 220% 100%') && css.includes('.tmr-skeleton-line--short'), 'sitewide skeleton shimmer and variants must remain');
assert(css.includes('.tmr-alert--success') && css.includes('.tmr-alert--warning') && css.includes('.tmr-alert--danger') && css.includes('.tmr-alert--info'), 'sitewide alert variants must remain');
assert(css.includes('body.tmr-site-shell .verify-success') && css.includes('body.tmr-site-shell .verify-error') && css.includes('body.tmr-site-shell .message.error'), 'legacy live message classes must remain styled');

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
