#!/usr/bin/env node
/**
 * Stamp the Trend Spotter asset ?v= refs with their content hash.
 *
 * The repo convention (version_static_refs.py) is a 12-char sha256 of the file
 * bytes as git stores them. That script must never be run from Windows — it
 * rewrites every file and CRLF-poisons the hashes. This does the same job for
 * the two Trend Spotter assets only, reading the bytes from the git index so
 * the result matches CI regardless of the local autocrlf setting, and writing
 * the HTML back byte-for-byte apart from the two refs.
 *
 *   node scripts/stamp-trendspotter-refs.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const HTML = path.join(root, 'trendspotter', 'index.html');
const ASSETS = ['static/css/trendspotter.css', 'static/js/trendspotter.js'];

function hashOf(rel) {
  // Stage first so the index reflects the working tree, then hash the blob.
  execFileSync('git', ['add', '--', rel], { cwd: root });
  const bytes = execFileSync('git', ['show', `:${rel}`], { cwd: root, maxBuffer: 1 << 26 });
  return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}

let html = fs.readFileSync(HTML, 'utf8');
for (const rel of ASSETS) {
  const hash = hashOf(rel);
  const re = new RegExp(`(/${rel.replace(/[/.]/g, (c) => '\\' + c)})\\?v=[^"']*`, 'g');
  // Re-running with an unchanged file must be a no-op, not an error, so the
  // guard is "the ref exists" rather than "the text changed".
  if (!re.test(html)) throw new Error(`no ?v= ref found for /${rel} in trendspotter/index.html`);
  re.lastIndex = 0;
  html = html.replace(re, `$1?v=${hash}`);
  console.log(`/${rel}?v=${hash}`);
}
fs.writeFileSync(HTML, html);
execFileSync('git', ['add', '--', 'trendspotter/index.html'], { cwd: root });
console.log('stamped trendspotter/index.html');
