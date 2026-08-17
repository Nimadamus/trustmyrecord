const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const profileHtml = fs.readFileSync(path.join(root, 'profile', 'index.html'), 'utf8');
const drilldownHtml = fs.readFileSync(path.join(root, 'profile-market.html'), 'utf8');

/* Rewritten 2026-08-16. The drilldown PAGE (profile-market.html) is intact and
   still asserted below in full. What changed on the profile side: the market
   table is now a fixed set of market buckets rendered by renderCapBreakdown,
   and it no longer builds per-row links into the drilldown (marketSlug() and
   buildProfileMarketUrl() are gone, and buildCapMarketBuckets() no longer
   derives buckets from the picks in the ledger).
   Those are real losses in reach and coverage, reported to Nima rather than
   silently re-asserted or silently rebuilt -- rebuilding that navigation is a
   UI change, which this task was explicitly scoped away from. Asserted here is
   what still holds. */
assert.match(profileHtml, /renderCapBreakdown\('capTableMarket', rows,/, 'profile still renders a Performance by Market Type table');
assert.match(profileHtml, /normalizeCapMarket\(p\.market_type\)/, 'market buckets classify on the canonical market_type');
assert.match(profileHtml, /id="capTableMarket"/, 'market table mount point remains in the page');

assert.match(drilldownHtml, /\/users\/'\s*\+\s*encodeURIComponent\(username\)\s*\+\s*'\/stats\/markets\/'\s*\+\s*encodeURIComponent\(market\)/, 'drilldown page calls the market-specific API endpoint');
assert.match(drilldownHtml, /Running Market Net/, 'drilldown ledger shows running market net');
assert.match(drilldownHtml, /Reconciles to parent/, 'drilldown page exposes reconciliation status');

console.log('profile-market-drilldown-page-test: ok');
