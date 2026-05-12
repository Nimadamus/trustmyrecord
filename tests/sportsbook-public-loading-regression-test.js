#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');

assert(/sportsbook-production-fix-persist-reliability\.js\?v=[^"']+&cb=[^"']+/.test(page), 'sportsbook page must load the repaired reliability bundle with cache-busting params');
assert(page.includes('board loading guard replaced frozen spinner') || reliability.includes('board loading guard replaced frozen spinner'), 'runtime must include the board loading guard');
assert(page.includes("cache: 'no-store'") || reliability.includes("cache: 'no-store'"), 'runtime must bypass stale API cache when loading boards');
assert(page.includes('AbortController') || reliability.includes('AbortController'), 'runtime must abort stuck board requests instead of freezing the sportsbook');
assert(reliability.includes('function renderBoard(summary, games)') || page.includes('function renderBoard(sport)'), 'runtime must include the sportsbook board renderer');

console.log('sportsbook public loading source contract passed');
