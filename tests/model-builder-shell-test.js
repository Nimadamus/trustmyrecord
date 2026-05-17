#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const shellPath = path.join(root, 'model-builder', 'index.html');
const sitewidePath = path.join(root, 'static', 'js', 'tmr-sitewide.js');

assert(fs.existsSync(shellPath), '/model-builder/ page exists');

const html = fs.readFileSync(shellPath, 'utf8');
const sitewide = fs.existsSync(sitewidePath) ? fs.readFileSync(sitewidePath, 'utf8') : '';
const visibleHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/TrustMyRecord/gi, '').replace(/trustmyrecord/gi, '');
const robotsMeta = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i);

assert(robotsMeta, 'page has robots meta tag');
assert(/content=["'][^"']*\bindex\b[^"']*\bfollow\b[^"']*["']/i.test(robotsMeta[0]), 'page remains index/follow');
assert(!/Checking access/.test(html), 'page does not start behind access check');
assert(!/Login required/.test(html), 'page does not block logged-out users');
assert(!/model-builder/i.test(sitewide), 'sitewide public navigation does not expose Model Builder');

assert(/Coming soon/.test(html), 'page clearly says Coming soon');
assert(/This tool is not available yet/.test(html), 'page clearly says tool is unavailable');
assert(/Back to Tools/.test(html), 'page links users back to Tools Hub');

[
  'Save model draft',
  'Assumption comparison',
  'modelBuilderForm',
  'modelBuilderList',
  'modelCompare',
  'modelName',
  'Model Tracker',
  'model-tracker',
  'tracked picks',
  'ROI',
  'win rate',
  'sample size',
  'backtest',
  'prediction',
  'marketplace',
  'leaderboard',
  'grading stats',
  'public profile',
  'performance claims',
].forEach((text) => {
  assert(!visibleHtml.includes(text), `visible page does not expose disallowed text/control: ${text}`);
});

console.log('model-builder-shell-test: ok');
