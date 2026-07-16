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
  // 4be927f3 installed the premium desktop homepage, replacing the
  // 20260508 dark-UI layer (and its <style id>) with the tmr-premium-* shell.
  // Guard the layer that replaced it.
  'class="tmr-premium-home"',
  'class="tmr-premium-hero"',
]) {
  assert(page.includes(required), `homepage canonical guard missing: ${required}`);
}

const canonicalIndex = page.indexOf('<link rel="canonical" href="https://trustmyrecord.com/">');
const redirectIndex = page.indexOf('var canonicalHomepage = "https://trustmyrecord.com/";');
const premiumIndex = page.indexOf('class="tmr-premium-home"');

assert(canonicalIndex !== -1, 'homepage canonical tag is missing');
assert(redirectIndex > canonicalIndex, 'canonical redirect script should follow the canonical tag');
assert(premiumIndex > redirectIndex, 'premium dark homepage layer must remain after canonical redirect guard');

assert(!page.includes('https://www.trustmyrecord.com/" rel="canonical"'), 'www canonical URL must not be restored');
assert(!page.includes('<link rel="canonical" href="http://trustmyrecord.com/'), 'http canonical URL must not be restored');

console.log('homepage canonical regression test passed');
