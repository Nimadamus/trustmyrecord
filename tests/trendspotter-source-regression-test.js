#!/usr/bin/env node

// Trend Spotter source-integrity regression.
//
// Rewritten 2026-08-01 for the workspace redesign. The page no longer computes
// anything in the browser: it renders whatever the audited backend engine
// (services/trendQueryEngine.js) returns, and that engine has its own 62-case
// fixture suite. This guard therefore protects the two things a redesign can
// quietly break on the client:
//
//   1. The page never grades, re-grades, or estimates a result client-side.
//   2. The user-facing copy stays product language, not engineering notes.
//
// Reference: trendspotter/index.html, static/js/trendspotter.js,
// static/css/trendspotter.css.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'trendspotter', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'static', 'js', 'trendspotter.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'static', 'css', 'trendspotter.css'), 'utf8');

// --- Structural contract: the workspace the redesign shipped ----------------
for (const id of [
  'leagueTabs',        // league segmented control
  'teamSearch',        // team combobox
  'teamSuggest',
  'matchupList',       // matchup cards
  'marketTabs',        // market tabs, including the locked ones
  'filterFields',      // conditionally-rendered filters
  'validationMessage',
  'runTrend',
  'resetFilters',
  'querySummary',      // live query sentence
  'results',
  'resultsBody',
  'sourceStatus',
]) {
  assert(html.includes(`id="${id}"`), `Trend Spotter must keep the #${id} control`);
}

// --- The page must talk to the audited engine, not improvise ---------------
assert(js.includes('/trendspotter/capabilities'), 'UI must render itself from the capabilities endpoint');
assert(js.includes('/trendspotter/matchups'), 'UI must load matchups from the matchups endpoint');
assert(js.includes('/trendspotter/query'), 'UI must run trends through the query endpoint');

// No client-side settlement. These are the exact shapes the previous build used
// to grade games in the browser; none of them may come back.
const BANNED_CLIENT_MATH = [
  /perRowOutcome/,
  /function\s+resultCounts/,
  /market_result/,
  /raw_game_log/,
  /thresholdMatchesTrend/,
  /extendedTrendForQuery/,
];
for (const pattern of BANNED_CLIENT_MATH) {
  assert(!pattern.test(js), `Trend Spotter must not settle games in the browser (matched ${pattern})`);
}
assert(!js.includes('Math.random'), 'Trend Spotter must never generate a random value');

// --- Copy: product language, not internal engineering notes ----------------
const copy = html + js;
const BANNED_COPY = [
  [/source rows are connected/i, 'internal "source rows are connected" phrasing'],
  [/impossible combinations are blocked before generation/i, 'internal validation phrasing'],
  [/artifacts when available/i, 'internal artifact phrasing'],
  [/Unsupported \/ estimated/i, 'internal data-policy table copy'],
  [/Partial \/ blocked/i, 'internal data-policy table copy'],
  [/Configure Variables/i, 'the old "Configure Variables" label'],
  [/Trend search/i, 'the old "Trend search" label'],
  [/Minimum sample/i, 'the old "Minimum sample" label'],
  [/Verified trend data source not connected yet/i, 'raw backend placeholder text'],
  [/>\s*Step [1-5]\s*</, 'the removed five-step strip'],
];
for (const [pattern, why] of BANNED_COPY) {
  assert(!pattern.test(copy), `Trend Spotter copy must not reintroduce ${why}`);
}

// --- Required product copy --------------------------------------------------
assert(html.includes('Verified Sports Research'), 'hero eyebrow must be present');
assert(html.includes('Build source-backed matchup trends in seconds.'), 'hero subtitle must be present');
assert(html.includes('Set conditions'), 'the filter card must be labelled "Set conditions"');
assert(html.includes('Run Trend'), 'the primary action must be "Run Trend"');
assert(/Minimum games/.test(js), 'the sample control must be labelled "Minimum games"');
assert(/Data details/.test(js), 'the provenance drawer must be present');

// --- The result must always be able to show its evidence -------------------
assert(/ts-table/.test(js) && /Closing line/.test(js) && /Units/.test(js),
  'the evidence table must carry the closing line and units per game');
assert(/interpretation/.test(js), 'the neutral interpretation block must be rendered');
assert(/not a prediction|not a betting recommendation/i.test(copy),
  'the result must state that it is descriptive, not predictive');

// --- Honest gaps -------------------------------------------------------------
assert(/no closing price recorded|needs a recorded price/.test(js),
  'a missing price must be reported, never replaced with a computed ROI');
assert(/Not recorded/.test(js), 'a per-game missing price must be labelled in the evidence table');
assert(/no closing price recorded for this market/.test(js),
  'a market with no prices at all must say so above the table instead of printing an empty column');

// --- Design system ----------------------------------------------------------
assert(html.includes('class="tmr-ds ts-page"'), 'page must opt into the TrustMyRecord design system');
assert(html.includes('tmr-ds-nav'), 'page must load the shared TrustMyRecord header and footer');
assert(!/^\s*:root\s*\{/m.test(css), 'design-system contract: page stylesheets must not declare :root');
assert(!/#05070d|--ts-bg\b/.test(css), 'the old dark navy-on-navy palette must be gone');

// --- Accessibility ----------------------------------------------------------
assert(/role="tablist"/.test(html), 'market and league tabs must be a tablist');
assert(/role="combobox"/.test(html), 'team search must be an accessible combobox');
assert(/aria-live="polite"/.test(html), 'results must announce themselves to screen readers');
assert(/aria-busy/.test(copy), 'the loading state must be announced');
assert(/focus-visible/.test(css), 'focus states must be visible');

console.log('trendspotter source regression test passed');
