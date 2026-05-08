#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'trendspotter', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'static', 'js', 'trendspotter.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'static', 'css', 'trendspotter.css'), 'utf8');

for (const id of [
  'sportOptions',
  'matchupFilter',
  'teamFilter',
  'marketType',
  'trendFactor',
  'researchMode',
  'currentMatchupOnly',
  'slateDateIndicator',
  'runTrendspotter',
  'sourceModal',
  'sourceModalBody',
]) {
  assert(html.includes(`id="${id}"`), `Trendspotter page must keep #${id}`);
}

assert(html.includes('Verified MLB betting research'), 'Trendspotter hero must identify the MLB-only verified release');
assert(html.includes('No fake confidence'), 'Trendspotter page must keep the no-fake-confidence guardrail');
assert(html.includes('ROI') && html.includes('Hidden unless verified'), 'ROI must remain hidden unless verified');
assert(html.includes('/static/js/trendspotter.js?v=20260508mlbonly1'), 'Trendspotter page must load the current cache-busted script');
assert(html.includes('/static/css/trendspotter.css?v=20260508mlbonly1'), 'Trendspotter page must load the current cache-busted stylesheet');

assert(js.includes('var CURRENT_SUPPORTED_SPORTS = ["MLB"];'), 'Current-slate Trendspotter must remain MLB-only');
assert(js.includes('researchMode: "current"'), 'Trendspotter must default to current-slate research');
assert(js.includes('currentMatchupOnly: true'), 'Trendspotter must default to selected-matchup-only results');
assert(js.includes('function isCurrentSlateItem(item)'), 'Trendspotter must keep current slate date validation');
assert(js.includes('function isCurrentSupportedSport(sport)'), 'Trendspotter must keep supported-sport gating');
assert(js.includes('if (state.researchMode === "current")') && js.includes('verifiedSlate = verifiedSlate.filter(isCurrentSlateItem);'), 'Current mode must filter stale matchups out');
assert(js.includes('Current Trendspotter is MLB-only in this release'), 'Non-MLB current sports must stay explicitly blocked');
assert(js.includes('unavailable_reason: "Current " + sport + " Trendspotter is intentionally unavailable in this MLB-only release."'), 'Unsupported current sports must expose an unavailable reason');
assert(js.includes('function verifiedRoi(trend)'), 'Trendspotter must compute ROI only through the verified ROI helper');
assert(js.includes('ROI hidden because verified odds/results/unit basis are incomplete.'), 'Source modal must explain hidden ROI when verification is incomplete');
assert(js.includes('ROI calculated from verified odds, results, and unit basis.'), 'Source modal must explain verified ROI when complete');
assert(js.includes('function openSourceModal(trend)'), 'Trendspotter must keep verified source drilldown modal');
assert(js.includes('data-source-id'), 'Trend cards must keep source drilldown buttons');
assert(js.includes('data-detail-toggle'), 'Trend cards must keep expandable detail panels');
assert(!js.includes('Math.random'), 'Trendspotter must not generate fake/random confidence or stats');

assert(css.includes('@media (max-width: 860px)'), 'Trendspotter mobile layout guard must remain');
assert(css.includes('.ts-modal') && css.includes('.ts-result-item'), 'Trendspotter modal and result-card styles must remain');

console.log('trendspotter source regression test passed');
