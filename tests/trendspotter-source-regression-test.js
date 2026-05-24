#!/usr/bin/env node

// Reconciled 2026-05-23 to the current post-rollback Trend Spotter product.
// The pre-rollback MLB-only "researchMode / verifiedRoi / openSourceModal"
// design was removed in emergency rollback e1ceda97 (restore tree to bf85e9a1).
// This regression test now guards the live multi-sport, source-gated build
// served at /trendspotter/ so the real verified-data guarantees cannot silently
// regress. Reference: trendspotter/index.html (?v=20260518-generate2),
// static/js/trendspotter.js, static/css/trendspotter.css.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'trendspotter', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'static', 'js', 'trendspotter.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'static', 'css', 'trendspotter.css'), 'utf8');

// --- Page must keep the current filter controls (sport -> matchup -> market -> run) ---
for (const id of [
  'sportSelect',
  'matchupSelect',
  'marketOptions',
  'trendKindSelect',
  'sideSelect',
  'teamSelect',
  'periodSelect',
  'rangeSelect',
  'sampleInput',
  'thresholdInput',
  'locationSelect',
  'generateTrend',
  'resultsList',
  'dataStatus',
  'validationMessage',
  'selectionSummary',
]) {
  assert(html.includes(`id="${id}"`), `Trendspotter page must keep #${id}`);
}

assert(html.includes('/static/js/trendspotter.js?v=20260518-generate2'), 'Trendspotter page must load the current cache-busted script');
assert(html.includes('/static/css/trendspotter.css?v=20260518-generate2'), 'Trendspotter page must load the current cache-busted stylesheet');

// --- Multi-sport, board-key driven sourcing (current product, not MLB-only) ---
assert(js.includes('var SPORTS = ["MLB", "NBA", "NFL", "NHL", "NCAAB", "NCAAF"];'), 'Trendspotter must keep the multi-sport list');
assert(js.includes('var BOARD_KEYS = {') && js.includes('MLB: "baseball_mlb"'), 'Trendspotter must keep the sport->board-key map');

// --- Real verified data sources only ---
assert(js.includes('/trendspotter/verified?sport='), 'Trendspotter must fetch the verified trend artifact endpoint');
assert(js.includes('/games/board/'), 'Trendspotter must fetch the live games board for matchups');

// --- Source gating: only render source-backed trends with real source rows ---
assert(js.includes('function sourceRows(trend)'), 'Trendspotter must keep the source-rows accessor');
assert(js.includes('function marketMatches(trend, market)'), 'Trendspotter must keep market matching');
assert(
  js.includes('if (trend.source_classification !== "source_backed" || !marketMatches(trend, market) || !sourceRows(trend).length) return false;'),
  'Trendspotter must drop any trend that is not source-backed, market-matched, and backed by real source rows'
);
assert(js.includes('source_backed: { key: "source-backed", label: "Source-backed" }'), 'Trendspotter must keep source classification labels');

// --- No fake/guessed output: no RNG, and forbidden claim words are filtered out ---
assert(!js.includes('Math.random'), 'Trendspotter must not generate fake/random confidence or stats');
assert(js.includes('var FORBIDDEN_OUTPUT = ['), 'Trendspotter must keep the forbidden-output guard list');
for (const pattern of ['/\\broi\\b/i', '/\\bwin rate\\b/i', '/\\brecord\\b/i', '/\\bprediction\\b/i', '/\\bbetting edge\\b/i']) {
  assert(js.includes(pattern), `Forbidden-output guard must keep ${pattern}`);
}
assert(js.includes('function safeText(value)') && js.includes('FORBIDDEN_OUTPUT.some('), 'safeText must strip any forbidden claim language before rendering');

// --- Verified-trend cards expose the underlying source rows (drilldown / transparency) ---
assert(js.includes('class=\\"ts-result-item\\"') && js.includes('data-result=\\"verified-trend\\"'), 'Verified trend cards must render as source-labeled result items');
assert(js.includes('function sourceRowsHtml(rows)'), 'Trendspotter must render the per-trend verified source-row table');
assert(js.includes('var SAFE_MESSAGES = {'), 'Trendspotter must keep safe fallback messaging for missing/empty data');

// --- Styling guards ---
assert(css.includes('@media (max-width: 860px)'), 'Trendspotter mobile layout guard must remain');
assert(css.includes('.ts-modal') && css.includes('.ts-result-item'), 'Trendspotter modal and result-card styles must remain');

console.log('trendspotter source regression test passed');
