#!/usr/bin/env node
/**
 * Republish static/js/tmr-home-live.js under a fresh content hash.
 *
 * index.html loads the HASHED copy, never the source file, so an edit to
 * static/js/tmr-home-live.js changes nothing a visitor sees - and nothing a
 * browser proof sees either, which is a genuinely expensive way to be fooled by
 * a green test. This does the three steps that convention requires, in order:
 *
 *   1. hash the source the way scripts/stamp-asset-refs.js does - a 12 char
 *      sha256 of the bytes AS GIT STORES THEM, read back out of the index, so
 *      the hash is the same on Windows and in CI whatever autocrlf is doing;
 *   2. write static/js/tmr-home-live.<hash>.js beside it;
 *   3. repoint every HTML reference at the new name.
 *
 * The previous hashed copy is left in place: pages already served carry the old
 * name and must keep resolving.
 *
 *   node scripts/rehash-home-live.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const REL = 'static/js/tmr-home-live.js';
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

execFileSync('git', ['add', '--', REL], { cwd: root });
const bytes = execFileSync('git', ['show', `:${REL}`], { cwd: root, maxBuffer: 1 << 26 });
const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const hashedRel = `static/js/tmr-home-live.${hash}.js`;

fs.writeFileSync(path.join(root, hashedRel), fs.readFileSync(path.join(root, REL)));

/* index.html declares the build twice: the script it loads, and the
   data-tmr-build attribute the visibility lock reads to prove the two are the
   same build. Both move together or the lock fails - which is the point of it. */
const re = /\/static\/js\/tmr-home-live\.[a-f0-9]{12}\.js/g;
const buildRe = /data-tmr-build="[a-f0-9]{12}"/g;
let files = 0;
let refs = 0;
for (const file of htmlFiles(root)) {
  const before = fs.readFileSync(file, 'latin1');
  const matches = before.match(re);
  if (!matches) continue;
  const after = before.replace(re, `/${hashedRel}`).replace(buildRe, `data-tmr-build="${hash}"`);
  if (after === before) continue;
  fs.writeFileSync(file, after, 'latin1');
  files += 1;
  refs += matches.length;
}

console.log(`/${hashedRel}  ->  ${refs} ref(s) in ${files} file(s)`);
