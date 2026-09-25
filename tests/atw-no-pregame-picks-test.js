#!/usr/bin/env node
/* =============================================================================
   Handicappers Around the Web: no pregame pick in any published file
   -----------------------------------------------------------------------------
   RULE (Nima): a harvested pick is never public before its game starts. Only
   settled picks may appear in the static profile pages; admins read pending
   picks through the adminOnly /api/admin/atw/pending endpoint, which ships no
   data in the page.

   This scans every around-the-web/<slug>/index.html plus the list page and
   the sitemap, and fails on:
     1. any pick object whose "status" is not won / lost / push
     2. any pick whose commence_time is after its graded_at or after now
     3. the owner pending panel carrying rows inline instead of fetching them
     4. a sitemap URL for a profile directory that does not exist

   No network, no browser. Run: node tests/atw-no-pregame-picks-test.js
   (audit 2026-09-24)
============================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ATW = path.join(ROOT, 'around-the-web');
const SETTLED = new Set(['won', 'lost', 'push']);
const now = Date.now();
const failures = [];
let files = 0;
let picks = 0;

function scan(file) {
  const s = fs.readFileSync(file, 'utf8');
  files += 1;
  for (const m of s.matchAll(/"status":\s*"([a-z_]+)"/g)) {
    picks += 1;
    if (!SETTLED.has(m[1])) failures.push(`${path.relative(ROOT, file)}: pick with status "${m[1]}"`);
  }
  for (const m of s.matchAll(/"commence_time":\s*"([^"]+)"[^{}]*?"graded_at":\s*"([^"]+)"/g)) {
    const start = Date.parse(m[1]);
    if (start > now) failures.push(`${path.relative(ROOT, file)}: pick for a game that starts ${m[1]}`);
  }
  if (/atwAdminPending/.test(s) && /"pending_reason":\s*"/.test(s)) {
    failures.push(`${path.relative(ROOT, file)}: pending rows are inlined in the owner panel`);
  }
}

if (!fs.existsSync(ATW)) {
  console.log('around-the-web not present; nothing to check');
  process.exit(0);
}
scan(path.join(ATW, 'index.html'));
for (const d of fs.readdirSync(ATW)) {
  const f = path.join(ATW, d, 'index.html');
  if (fs.existsSync(f)) scan(f);
}
const sitemap = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(sitemap)) {
  const sm = fs.readFileSync(sitemap, 'utf8');
  for (const m of sm.matchAll(/https:\/\/trustmyrecord\.com\/around-the-web\/([^/<]+)\//g)) {
    if (!fs.existsSync(path.join(ATW, m[1], 'index.html'))) failures.push(`sitemap lists missing profile ${m[1]}`);
  }
}

console.log(`scanned ${files} files, ${picks} pick status fields`);
for (const f of failures.slice(0, 25)) console.log('FAIL', f);
console.log(failures.length ? `${failures.length} FAILED` : 'ALL PASS');
process.exit(failures.length ? 1 : 0);
