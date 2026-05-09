#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

for (const required of [
  '<link rel="canonical" href="https://trustmyrecord.com/">',
  'var canonicalHomepage = "https://trustmyrecord.com/";',
  'window.location.hostname === "www.trustmyrecord.com"',
  'window.location.protocol === "http:"',
  'window.location.pathname === "/index.html"',
  'window.location.replace(canonicalHomepage);',
  'HOMEPAGE_PREMIUM_DARK_UI_20260508',
  '<style id="tmr-home-premium-dark-ui-20260508">',
]) {
  assert(page.includes(required), `homepage canonical guard missing: ${required}`);
}

const canonicalIndex = page.indexOf('<link rel="canonical" href="https://trustmyrecord.com/">');
const redirectIndex = page.indexOf('var canonicalHomepage = "https://trustmyrecord.com/";');
const premiumIndex = page.indexOf('HOMEPAGE_PREMIUM_DARK_UI_20260508');

assert(canonicalIndex !== -1, 'homepage canonical tag is missing');
assert(redirectIndex > canonicalIndex, 'canonical redirect script should follow the canonical tag');
assert(premiumIndex > redirectIndex, 'premium dark homepage layer must remain after canonical redirect guard');

assert(!page.includes('https://www.trustmyrecord.com/" rel="canonical"'), 'www canonical URL must not be restored');
assert(!page.includes('<link rel="canonical" href="http://trustmyrecord.com/'), 'http canonical URL must not be restored');

console.log('homepage canonical regression test passed');
