#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// 2026-11-02: re-based on the current homepage. The in-page JS redirect
// (var canonicalHomepage ... location.replace) and the tmr-premium-* shell went
// away with the standalone homepage (d89df0a4, 2026-07-20). Host and protocol
// canonicalisation is done at the edge: http:// and www. both answer 301 to
// https://trustmyrecord.com/ (verified 2026-11-02). What this file can still
// guarantee offline is the canonical tag itself, and that it never regresses to
// a www or http URL. Nothing here changes canonical behaviour.
const canonicals = page.match(/<link rel="canonical"[^>]*>/g) || [];
assert.strictEqual(canonicals.length, 1, 'homepage must carry exactly one canonical tag');
assert.strictEqual(canonicals[0], '<link rel="canonical" href="https://trustmyrecord.com/">', 'homepage canonical must be the https apex root');
assert(page.includes('<meta property="og:url" content="https://trustmyrecord.com/">'), 'og:url must match the canonical');
assert(page.indexOf('<link rel="canonical"') < page.indexOf('</head>'), 'canonical tag must be in <head>');
assert(!/<meta[^>]+name="robots"[^>]+noindex/i.test(page), 'homepage must not be noindex');

assert(!page.includes('https://www.trustmyrecord.com/" rel="canonical"'), 'www canonical URL must not be restored');
assert(!page.includes('<link rel="canonical" href="http://trustmyrecord.com/'), 'http canonical URL must not be restored');
assert(!page.includes('<link rel="canonical" href="https://www.trustmyrecord.com/'), 'www canonical URL must not be restored');

console.log('homepage canonical regression test passed');
