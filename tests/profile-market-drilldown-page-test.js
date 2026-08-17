const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const profileHtml = fs.readFileSync(path.join(root, 'profile', 'index.html'), 'utf8');
const drilldownHtml = fs.readFileSync(path.join(root, 'profile-market.html'), 'utf8');

/* Navigation RESTORED 2026-08-16. profile-market.html was orphaned: the two
   helpers that built its URL (marketSlug / buildProfileMarketUrl) had been
   dropped in a refactor, and the API behind it answered 500 for every username
   (see trustmyrecord-backend/tests/market-drilldown-route-regression-test.js).
   Both are fixed, so the link path is asserted again.

   One deliberate difference from the original: a bucket in the Performance by
   Market Type table is COARSER than a market type (the Spread bucket holds
   spreads, f5_spreads and alt_spreads), while the drilldown reports one market
   type. A link is therefore offered only when every graded pick in the bucket
   shares a single market_type, so the drilldown always reproduces the row that
   was clicked. A mixed bucket stays plain text rather than opening a page whose
   totals disagree with it. */
assert.match(profileHtml, /function marketSlug\(value\)[\s\S]{0,400}replace\(\/\[\^a-z0-9\]\+\/g, '-'\)/, 'profile page includes market slug normalization');
assert.match(profileHtml, /function buildProfileMarketUrl\(marketType\)/, 'profile page builds drilldown URLs');
assert.match(profileHtml, /'\/profile-market\.html\?user=' \+ encodeURIComponent\(user\)\s*\+\s*'&market=' \+ encodeURIComponent\(marketSlug\(marketType\)\)/, 'drilldown URL carries user and slugged market');
assert.match(profileHtml, /const marketHref = marketTypes\.length === 1 \? buildProfileMarketUrl\(marketTypes\[0\]\) : '';/, 'a link is only offered for a single-market-type bucket');
assert.match(profileHtml, /id === 'capTableMarket'/, 'drilldown links are scoped to the market table');
assert.match(profileHtml, /View the ' \+ escapeHtml\(label\) \+ ' market breakdown/, 'the market label links to its breakdown');
assert.match(profileHtml, /profile-sport-view-indicator">View Breakdown</, 'the View Breakdown affordance is rendered');

assert.match(profileHtml, /renderCapBreakdown\('capTableMarket', rows,/, 'profile still renders a Performance by Market Type table');
assert.match(profileHtml, /normalizeCapMarket\(p\.market_type\)/, 'market buckets classify on the canonical market_type');
assert.match(profileHtml, /id="capTableMarket"/, 'market table mount point remains in the page');

assert.match(drilldownHtml, /\/users\/'\s*\+\s*encodeURIComponent\(username\)\s*\+\s*'\/stats\/markets\/'\s*\+\s*encodeURIComponent\(market\)/, 'drilldown page calls the market-specific API endpoint');
assert.match(drilldownHtml, /Running Market Net/, 'drilldown ledger shows running market net');
assert.match(drilldownHtml, /Reconciles to parent/, 'drilldown page exposes reconciliation status');

console.log('profile-market-drilldown-page-test: ok');
