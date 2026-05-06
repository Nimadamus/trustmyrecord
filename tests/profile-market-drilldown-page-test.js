const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const profileHtml = fs.readFileSync(path.join(root, 'profile', 'index.html'), 'utf8');
const drilldownHtml = fs.readFileSync(path.join(root, 'profile-market.html'), 'utf8');

assert.match(profileHtml, /function marketSlug\(value\)[\s\S]*replace\(\/\[\^a-z0-9\]\+\/g, '-'\)/, 'profile page includes market slug normalization');
assert.match(profileHtml, /buildProfileMarketUrl\(i\.market_type\)/, 'profile market grid links each API market row to drilldown page');
assert.match(profileHtml, /renderCapBreakdown\('capTableMarket', rows, buildCapMarketBuckets\(rows\)\)/, 'capper market table uses dynamic market buckets');
assert.match(profileHtml, /buildCapMarketBuckets[\s\S]*new Set[\s\S]*market_type[\s\S]*buildProfileMarketUrl\(marketType\)/, 'dynamic market table supports every market type found in picks');
assert.match(drilldownHtml, /\/users\/'\s*\+\s*encodeURIComponent\(username\)\s*\+\s*'\/stats\/markets\/'\s*\+\s*encodeURIComponent\(market\)/, 'drilldown page calls the market-specific API endpoint');
assert.match(drilldownHtml, /Running Market Net/, 'drilldown ledger shows running market net');
assert.match(drilldownHtml, /Reconciles to parent/, 'drilldown page exposes reconciliation status');

console.log('profile-market-drilldown-page-test: ok');
