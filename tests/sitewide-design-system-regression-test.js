#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'static', 'css', 'tmr-sitewide.css'), 'utf8');
const pagePolish = fs.readFileSync(path.join(root, 'static', 'css', 'tmr-page-polish.css'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'static', 'js', 'tmr-sitewide.js'), 'utf8');
const productSystem = fs.readFileSync(path.join(root, 'TRUSTMYRECORD_PRODUCT_UPGRADE_SYSTEM.md'), 'utf8');
/* Several shared primitives moved OUT of tmr-sitewide.css and into these two.
   tmr-light.css is referenced by ~130 pages, so for the question "does this
   vocabulary still exist anywhere in the shared system" all three count. */
const lightCss = fs.readFileSync(path.join(root, 'static', 'css', 'tmr-light.css'), 'utf8');
const allSystemCss = css + pagePolish + lightCss;

/* Every page in the repo, walked once and cached, for the orphan check below. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'artifacts', 'tests', 'workers']);
const htmlFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
})(root);
const _cache = new Map();
const readHtml = (f) => {
  if (!_cache.has(f)) _cache.set(f, fs.readFileSync(f, 'utf8'));
  return _cache.get(f);
};

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

/* ---------------------------------------------------------------------------
   WHAT THE SHARED SYSTEM ACTUALLY PROVIDES
   -----------------------------------------------------------------------------
   This file used to assert 97 selectors and 57 CSS treatments, all against
   tmr-sitewide.css. It had NEVER passed. The commit that added this test
   (2ee02be91, "Add TrustMyRecord regression lock gate") deleted 1245 lines from
   that stylesheet in the same commit, taking the whole primitives layer with it
   - cards, modals, form fields, pagination, metrics, feed rows, breadcrumbs,
   badges, alerts, skeletons, stack/cluster/grid.

   Checked both directions on 2026-08-24 before changing anything:
     * 80 of the 97 selectors exist in NONE of the three sitewide stylesheets;
     * 47 of the 57 treatment assertions fail;
     * and none of that vocabulary appears in any HTML in this repo.
   The layer was abandoned whole, markup and CSS together, so no page renders
   unstyled. Re-adding 1245 lines of CSS that nothing selects would put dead
   rules back onto ~140 pages, which is worse than the gap.

   So this file now asserts what the system genuinely ships, and the abandoned
   half is guarded the OTHER way round (see RETIRED_PRIMITIVES): it fails if any
   of it reappears in markup with no styles behind it. That is a real guarantee.
   The old blanket assertion could never reach its second line. */
const LIVE_SELECTORS = [
  'body.tmr-site-shell',
  '.tmr-global-nav',
  '.tmr-global-nav__brand',
  '.tmr-global-nav__button--primary',
  '.tmr-empty',
  '.tmr-empty__icon',
  '.tmr-cap-card',
  '.tmr-pick-table',
  '.tmr-sport-tag--mlb',
  '.tmr-sport-tag--nhl',
  '@media (max-width: 860px)',
  '@media (max-width: 720px)',
];
for (const selector of LIVE_SELECTORS) {
  assert(css.includes(selector), `sitewide design selector missing: ${selector}`);
}

/* Moved out of tmr-sitewide.css but still real - page-polish and light carry
   them, and tmr-light.css is on ~130 pages. Asserted against the whole system
   rather than one file, so a future move does not fail this for the wrong
   reason. */
const RELOCATED_SELECTORS = [
  '.tmr-empty-state',
  '.tmr-loading-state',
  '.tmr-spinner',
  '.tmr-page-head',
  '.tmr-tab',
];
for (const selector of RELOCATED_SELECTORS) {
  assert(allSystemCss.includes(selector),
    `design selector missing from every sitewide stylesheet: ${selector}`);
}

assert(css.includes('linear-gradient') && css.includes('rgba(45, 212, 191'), 'sitewide design system must keep dark premium accent treatments');
assert(css.includes('body.tmr-site-shell .btn-primary') && css.includes('body.tmr-site-shell button[type="submit"]'), 'sitewide primary button styles must remain');
assert(css.includes('body.tmr-site-shell input') && css.includes('body.tmr-site-shell select') && css.includes('body.tmr-site-shell textarea'), 'sitewide form control styles must remain');
assert(css.includes('display: inline-flex') && css.includes('justify-content: center'), 'sitewide button alignment must remain stable');
assert(css.includes('white-space: nowrap') && css.includes('max-width: 100%'), 'sitewide badge primitives must resist broken wrapping');
assert(css.includes('body.tmr-site-shell table') && css.includes('body.tmr-site-shell th') && css.includes('body.tmr-site-shell td'), 'sitewide table styles must remain');
assert(css.includes('body.tmr-site-shell .empty-state') && css.includes('body.tmr-site-shell .loading-state') && css.includes('body.tmr-site-shell .error-state'), 'sitewide empty/loading/error styles must remain');

for (const selector of [
  'body.tmr-polished-page',
  'body.tmr-polished-page::before',
  '.tmr-shell',
  '.tmr-page-header',
  '.tmr-h1',
  '.tmr-h2',
  '.tmr-glass',
  '.tmr-cta-primary',
  '.tmr-cta-secondary',
  '.tmr-empty-state',
  '.tmr-input',
  '.tmr-textarea',
  '.tmr-select',
  '@media (max-width: 720px)'
]) {
  assert(pagePolish.includes(selector), `page polish selector missing: ${selector}`);
}

assert(pagePolish.includes('linear-gradient(135deg, var(--tmrp-neon-cyan), var(--tmrp-neon-purple))'), 'page polish premium gradient treatment must remain');
assert(pagePolish.includes('backdrop-filter: blur(20px) saturate(140%)'), 'page polish glass card treatment must remain');
assert(pagePolish.includes('border-color: var(--tmrp-neon-cyan)') && pagePolish.includes('background: rgba(0, 255, 255, 0.04)'), 'page polish form focus treatment must remain');

for (const required of [
  'tmr-global-nav',
  'tmr-global-nav__brand',
  'buildLoggedOutActions',
  'buildLoggedInActions',
  'data-tmr-route',
]) {
  assert(nav.includes(required), `sitewide navigation source missing ${required}`);
}

/* Chrome is served two ways and this list must say which. Four of the pages
   originally asserted here (index, polls, leaderboards, handicappers) migrated
   to the design-system nav and legitimately no longer load tmr-sitewide.*;
   asserting the legacy pair against them has been failing ever since. Every
   page is still asserted - each against the chrome it actually uses - so a page
   silently losing its nav is still caught. */
const LEGACY_SHELL_PAGES = [
  'sportsbook/index.html',
  'profile/index.html',
  'arena/index.html',
  'feed/index.html',
  'marketplace/index.html',
  'about/index.html',
  'contact/index.html',
  'report-bug/index.html',
  'privacy/index.html',
  'terms/index.html',
];
for (const page of LEGACY_SHELL_PAGES) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert(/tmr-sitewide\.css\?v=/.test(html), `${page} must load cache-busted sitewide CSS`);
  assert(/tmr-sitewide\.js\?v=/.test(html), `${page} must load cache-busted sitewide nav JS`);
}

const DS_SHELL_PAGES = [
  'index.html',
  'polls/index.html',
  'leaderboards/index.html',
  'handicappers/index.html',
];
for (const page of DS_SHELL_PAGES) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert(/tmr-ds-nav\.[0-9a-f]{12}\.js/.test(html),
    `${page} must load the content-hashed design-system nav`);
  assert(/tmr-ds\.[0-9a-f]{12}\.css/.test(html),
    `${page} must load the content-hashed design-system stylesheet`);
}

for (const page of [
  'about/index.html',
  'contact/index.html',
  'report-bug/index.html',
  'privacy/index.html',
  'terms/index.html',
]) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert(/tmr-page-polish\.css\?v=/.test(html), `${page} must load cache-busted page polish CSS`);
  /* Match the CLASS, not the whole attribute. These pages later gained a second
     class (`tmr-polished-page tmr-light`), which an exact-string check reads as
     "opted out" while the page is in fact opted in. */
  assert(/<body[^>]*\bclass="[^"]*\btmr-polished-page\b/.test(html),
    `${page} must opt into the polished page shell`);
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

/* ---------------------------------------------------------------------------
   THE RETIRED VOCABULARY
   -----------------------------------------------------------------------------
   Deleted by 2ee02be91 and never re-homed. Nothing styles these and nothing
   uses them, which is the ONLY reason their absence is acceptable. Listed here
   rather than deleted from the test so the record survives, and guarded in the
   direction that can still catch a real defect: if one reappears in MARKUP
   while still having no CSS anywhere, that page renders unstyled and this
   fails.

   A page is allowed to own the class outright - /embed/ is the standing
   example, a self-contained widget that defines .tmr-card, .tmr-grid and
   .tmr-avatar in its own inline <style>. Those are styled, just not by the
   shared system, so page-local CSS counts. */
const RETIRED_PRIMITIVES = [
  '.tmr-skeleton',
  '.tmr-skeleton-line',
  '.tmr-skeleton-block',
  '.tmr-skeleton-avatar',
  '.tmr-table-wrap',
  '.tmr-page-title',
  '.tmr-page-subtitle',
  '.tmr-stack',
  '.tmr-cluster',
  '.tmr-grid',
  '.tmr-card',
  '.tmr-card__head',
  '.tmr-card__title',
  '.tmr-card__body',
  '.tmr-card__foot',
  '.tmr-divider',
  '.tmr-divider-label',
  '.tmr-avatar',
  '.tmr-avatar--sm',
  '.tmr-avatar--lg',
  '.tmr-identity',
  '.tmr-identity__name',
  '.tmr-identity__meta',
  '.tmr-form-grid',
  '.tmr-field',
  '.tmr-field__label',
  '.tmr-field__hint',
  '.tmr-field__error',
  '.tmr-stepper',
  '.tmr-step',
  '.tmr-step__index',
  '.tmr-step__label',
  '.tmr-progress',
  '.tmr-progress__bar',
  '.tmr-odds',
  '.tmr-odds--positive',
  '.tmr-odds--negative',
  '.tmr-unit',
  '.tmr-price-stack',
  '.tmr-price-stack__label',
  '.tmr-segmented',
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
];
const orphaned = [];
for (const selector of RETIRED_PRIMITIVES) {
  if (allSystemCss.includes(selector)) continue;           // quietly came back: fine
  const cls = selector.slice(1);
  const usedIn = new RegExp('class="[^"]*\\b' + cls + '\\b');
  const stylesItself = new RegExp('\\.' + cls + '\\s*[,{]');
  const broken = htmlFiles.filter((f) => {
    const html = readHtml(f);
    return usedIn.test(html) && !stylesItself.test(html);
  });
  if (broken.length) {
    orphaned.push(`${selector} used by ${broken.length} page(s) with no CSS anywhere `
      + `(e.g. ${path.relative(root, broken[0])})`);
  }
}
assert(orphaned.length === 0,
  'retired primitives are being used in markup with no styles behind them:\n  '
  + orphaned.join('\n  '));
