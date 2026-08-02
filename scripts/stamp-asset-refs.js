#!/usr/bin/env node
/**
 * Stamp every `?v=` ref to a shared static asset with that asset's content hash.
 *
 * Same convention and the same reason as scripts/stamp-trendspotter-refs.js:
 * a 12-char sha256 of the bytes as git stores them, read from the index so the
 * result matches CI regardless of the local autocrlf setting. version_static_refs.py
 * does this repo-wide but must never be run from Windows — it rewrites every
 * file and CRLF-poisons the hashes. This touches only the pages that already
 * reference the asset, and only the ref token inside them.
 *
 *   node scripts/stamp-asset-refs.js static/js/tmr-sitewide.js [...more assets]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const assets = process.argv.slice(2);
if (!assets.length) {
  console.error('usage: node scripts/stamp-asset-refs.js <repo-relative asset> ...');
  process.exit(2);
}

const SKIP = new Set(['node_modules', '.git', 'artifacts', 'test-results', 'playwright-report']);

function htmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function hashOf(rel) {
  execFileSync('git', ['add', '--', rel], { cwd: root });
  const bytes = execFileSync('git', ['show', `:${rel}`], { cwd: root, maxBuffer: 1 << 26 });
  return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}

const pages = htmlFiles(root);
let touched = 0;

for (const rel of assets) {
  const hash = hashOf(rel);
  const escaped = rel.replace(/[/.]/g, (c) => '\\' + c);
  // The ref token ends at the first quote, angle bracket or whitespace. Using
  // [^"']* instead runs past the end of an unquoted ref — the one inside the
  // LEGACY_PAGE_FOOTER_REMOVED comment — and eats the markup after it.
  const re = new RegExp(`(/${escaped})\\?v=[^"'\\s>]*`, 'g');
  let files = 0;
  let refs = 0;
  for (const file of pages) {
    // Read as a buffer and write back as one, so a page's own line endings
    // survive untouched; only the ref token changes.
    const before = fs.readFileSync(file, 'latin1');
    const matches = before.match(re);
    if (!matches) continue;
    const after = before.replace(re, `$1?v=${hash}`);
    if (after === before) continue;
    fs.writeFileSync(file, after, 'latin1');
    files += 1;
    refs += matches.length;
    touched += 1;
  }
  console.log(`/${rel}?v=${hash}  ->  ${refs} ref(s) in ${files} file(s)`);
}

console.log(touched ? `stamped ${touched} file(s)` : 'nothing to stamp (already current)');
