#!/usr/bin/env node

// Model Builder is now a live research tool: backtests over the verified
// graded-pick ledger + isolated forward tracking. These invariants keep it
// honest (real data source, warnings, no fabricated numbers, indexable, not
// hard-gated behind a blocking access wall) without locking it back to the old
// coming-soon placeholder.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const shellHtmlPath = path.join(root, 'model-builder', 'index.html');
const shellJsPath = path.join(root, 'static', 'js', 'model-builder-shell.js');
const sitewidePath = path.join(root, 'static', 'js', 'tmr-sitewide.js');

assert(fs.existsSync(shellHtmlPath), '/model-builder/ page exists');
assert(fs.existsSync(shellJsPath), 'model-builder shell script exists');

const html = fs.readFileSync(shellHtmlPath, 'utf8');
const js = fs.readFileSync(shellJsPath, 'utf8');
const sitewide = fs.existsSync(sitewidePath) ? fs.readFileSync(sitewidePath, 'utf8') : '';

// SEO / indexability
const robotsMeta = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i);
assert(robotsMeta, 'page has robots meta tag');
assert(/content=["'][^"']*\bindex\b[^"']*\bfollow\b[^"']*["']/i.test(robotsMeta[0]), 'page remains index/follow');

// Must NOT be hard-gated behind a blocking access wall (tool is usable logged out)
assert(!/Checking access/i.test(html), 'page does not start behind a blocking access check');
assert(!/\bLogin required\b/i.test(html), 'page does not hard-block logged-out users');

// Must NOT have reverted to the coming-soon placeholder
assert(!/Coming soon/i.test(html), 'page is no longer a coming-soon placeholder');

// Honest data-source + safeguards must be present
assert(/verified/i.test(html) && /graded/i.test(html), 'page states it uses the verified graded ledger');
assert(/data source|Source:/i.test(html) || /data source|Source:/i.test(js), 'page/shell exposes a data-source label');
assert(html.includes('sourceBadges'), 'page has a freshness/data-source badge host');
assert(html.includes('resultFreshness') || /last updated/i.test(js), 'results carry a last-updated timestamp');

// Core interactive controls exist
[
  'modelBuilderForm', 'modelSport', 'marketChips', 'runBtn',
  'saveBtn', 'resultsBody', 'modelList', 'publicTrackedHost', 'forwardPanel',
].forEach((id) => {
  assert(html.includes(id), `builder markup keeps #${id}`);
});

// Metrics come from the API, never hardcoded fake numbers
assert(/runBacktest/.test(js), 'shell calls the backtest API');
assert(/modelCatalog/.test(js), 'shell loads the data-coverage catalog');
assert(/getPublicTrackedModels/.test(js), 'shell loads publicly verified tracked models');
assert(/skeleton/i.test(js), 'shell shows a loading skeleton before results (no stale flash)');

// No fabricated-data language anywhere
[/fake ROI/i, /fake win rate/i, /fake record/i, /guaranteed/i, /lorem ipsum/i].forEach((re) => {
  assert(!re.test(html) && !re.test(js), `no fabricated/placeholder language: ${re}`);
});

// The tool must be reachable from the site (no orphan pages): the global
// footer links to it. (Kept as a positive reachability check.)
if (sitewide) {
  assert(/\/model-builder\//.test(sitewide), 'global footer links to the Model Builder so it is not orphaned');
}

console.log('model-builder-shell-test: ok');
