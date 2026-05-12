#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const defaultTargets = [
  'index.html',
  'sportsbook/index.html',
  'my-pending-picks/index.html',
  'profile/index.html',
  'model-builder/index.html',
  'trendspotter/index.html',
  'arena/index.html',
  'forum/index.html',
  'login/index.html',
  'static/js/sportsbook-production-fix-persist-reliability.js',
  'static/js/model-builder-shell.js',
  'static/js/trendspotter.js',
  'static/js/tmr-sitewide.js',
  'static/css/sportsbook-pro.css',
  'static/css/tmr-redesign-overrides-sportsbook.css',
  'static/css/trendspotter.css',
];

const forbidden = [
  /\bfake ROI\b/i,
  /\bfake win rate\b/i,
  /\bfake records?\b/i,
  /\bfake predictions?\b/i,
  /\bfake backtests?\b/i,
  /\blorem ipsum\b/i,
  /\bpreview version\b/i,
  /\bMy Pick History\b/i,
  /\bplayer props\b/i,
  /\bprops board\b/i,
  /\bprop market\b/i,
];

function collectFiles(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [absolute];
  const results = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.tmp') || entry.name === 'artifacts') continue;
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(path.relative(root, child)));
    } else if (/\.(html|js|css|md)$/i.test(entry.name)) {
      results.push(child);
    }
  }
  return results;
}

const files = defaultTargets.flatMap(collectFiles);
const failures = [];

for (const file of files) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');
  const searchable = source
    .replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, (match) => relative.startsWith('static/js/') ? match : ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const pattern of forbidden) {
    const match = searchable.match(pattern);
    if (match) failures.push(`${relative}: forbidden text "${match[0]}" matched ${pattern}`);
  }
}

if (failures.length) {
  console.error('Forbidden text scan failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Forbidden text scan passed (${files.length} files checked).`);
